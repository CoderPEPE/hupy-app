//! Per-module curriculum and learner state — the tables behind
//! [`crate::services::curriculum`].

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::{ModuleProgress, PlanetLesson};
use crate::schema::{flashcards, planet_lessons, user_module_progress};
use chrono::Utc;
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

/// A planet's modules in curriculum order.
pub async fn lessons_for(pool: &DbPool, planet_id: Uuid) -> Result<Vec<PlanetLesson>> {
    run_db(pool, move |conn| {
        Ok(planet_lessons::table
            .filter(planet_lessons::planet_id.eq(planet_id))
            .order(planet_lessons::position.asc())
            .select(PlanetLesson::as_select())
            .load(conn)?)
    })
    .await
}

pub async fn lesson(pool: &DbPool, lesson_id: Uuid) -> Result<Option<PlanetLesson>> {
    run_db(pool, move |conn| {
        Ok(planet_lessons::table
            .find(lesson_id)
            .select(PlanetLesson::as_select())
            .first(conn)
            .optional()?)
    })
    .await
}

/// This learner's state for every module of one planet, keyed by lesson id.
pub async fn progress_for_planet(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<HashMap<Uuid, ModuleProgress>> {
    run_db(pool, move |conn| {
        let rows: Vec<ModuleProgress> = user_module_progress::table
            .inner_join(
                planet_lessons::table
                    .on(planet_lessons::id.eq(user_module_progress::lesson_id)),
            )
            .filter(user_module_progress::user_id.eq(user_id))
            .filter(planet_lessons::planet_id.eq(planet_id))
            .select(ModuleProgress::as_select())
            .load(conn)?;
        Ok(rows.into_iter().map(|p| (p.lesson_id, p)).collect())
    })
    .await
}

/// Marks the conversation of a module finished, recording the structures the
/// learner kept missing so later prompts can bring them back.
pub async fn complete_conversation(
    pool: &DbPool,
    user_id: Uuid,
    lesson_id: Uuid,
    weak: Value,
) -> Result<ModuleProgress> {
    run_db(pool, move |conn| {
        let now = Utc::now();
        Ok(diesel::insert_into(user_module_progress::table)
            .values((
                user_module_progress::user_id.eq(user_id),
                user_module_progress::lesson_id.eq(lesson_id),
                user_module_progress::conversation_done.eq(true),
                user_module_progress::weak_structures.eq(&weak),
                user_module_progress::updated_at.eq(now),
            ))
            .on_conflict((
                user_module_progress::user_id,
                user_module_progress::lesson_id,
            ))
            .do_update()
            .set((
                user_module_progress::conversation_done.eq(true),
                user_module_progress::weak_structures.eq(&weak),
                user_module_progress::updated_at.eq(now),
            ))
            .returning(ModuleProgress::as_returning())
            .get_result(conn)?)
    })
    .await
}

/// Sets the flashcard half of the gate. Called after every card review, from
/// the count in [`flashcard_counts`].
pub async fn set_flashcards_done(
    pool: &DbPool,
    user_id: Uuid,
    lesson_id: Uuid,
    done: bool,
) -> Result<()> {
    run_db(pool, move |conn| {
        let now = Utc::now();
        diesel::insert_into(user_module_progress::table)
            .values((
                user_module_progress::user_id.eq(user_id),
                user_module_progress::lesson_id.eq(lesson_id),
                user_module_progress::flashcards_done.eq(done),
                user_module_progress::updated_at.eq(now),
            ))
            .on_conflict((
                user_module_progress::user_id,
                user_module_progress::lesson_id,
            ))
            .do_update()
            .set((
                user_module_progress::flashcards_done.eq(done),
                user_module_progress::updated_at.eq(now),
            ))
            .execute(conn)?;
        Ok(())
    })
    .await
}

/// (cards in this module, of those how many have been reviewed at least once)
/// — the numbers the flashcard gate is decided from, and what the app shows
/// as "3 of 6 cards".
pub async fn flashcard_counts(
    pool: &DbPool,
    user_id: Uuid,
    lesson_id: Uuid,
) -> Result<(i64, i64)> {
    run_db(pool, move |conn| {
        let total: i64 = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::lesson_id.eq(lesson_id))
            .count()
            .get_result(conn)?;
        let reviewed: i64 = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::lesson_id.eq(lesson_id))
            .filter(flashcards::repetitions.gt(0))
            .count()
            .get_result(conn)?;
        Ok((total, reviewed))
    })
    .await
}

/// The module a flashcard belongs to, if any — lets a card review update the
/// right module's gate without the client having to say which.
pub async fn lesson_of_card(pool: &DbPool, card_id: Uuid) -> Result<Option<Uuid>> {
    run_db(pool, move |conn| {
        Ok(flashcards::table
            .find(card_id)
            .select(flashcards::lesson_id)
            .first::<Option<Uuid>>(conn)
            .optional()?
            .flatten())
    })
    .await
}

/// Finished modules per planet for one learner, in a single query — the
/// list endpoint needs the number for all 60 planets at once.
///
/// A plain count is enough: modules are only ever completed in order (the
/// state machine refuses to open a later one), so "how many rows are done"
/// and "how far along the path" cannot disagree.
pub async fn completed_counts_by_planet(
    pool: &DbPool,
    user_id: Uuid,
) -> Result<HashMap<Uuid, i64>> {
    run_db(pool, move |conn| {
        let rows: Vec<(Uuid, i64)> = user_module_progress::table
            .inner_join(
                planet_lessons::table
                    .on(planet_lessons::id.eq(user_module_progress::lesson_id)),
            )
            .filter(user_module_progress::user_id.eq(user_id))
            .filter(user_module_progress::conversation_done.eq(true))
            .filter(user_module_progress::flashcards_done.eq(true))
            .group_by(planet_lessons::planet_id)
            .select((planet_lessons::planet_id, diesel::dsl::count_star()))
            .load(conn)?;
        Ok(rows.into_iter().collect())
    })
    .await
}

/// Replaces one module's curriculum — what it drills and the chunks it
/// teaches. Written by the `seed_curriculum` binary.
pub async fn set_curriculum(
    pool: &DbPool,
    lesson_id: Uuid,
    title: &str,
    description: &str,
    focus: &str,
    structures: Value,
) -> Result<()> {
    let (title, description, focus) = (
        title.to_string(),
        description.to_string(),
        focus.to_string(),
    );
    run_db(pool, move |conn| {
        diesel::update(planet_lessons::table.find(lesson_id))
            .set((
                planet_lessons::title.eq(&title),
                planet_lessons::description.eq(&description),
                planet_lessons::focus.eq(&focus),
                planet_lessons::structures.eq(&structures),
            ))
            .execute(conn)?;
        Ok(())
    })
    .await
}

/// The verbs (or themes) a planet is built around, in the course's own
/// target language.
pub async fn set_focus_verbs(pool: &DbPool, planet_id: Uuid, verbs: Value) -> Result<()> {
    run_db(pool, move |conn| {
        diesel::update(crate::schema::planets::table.find(planet_id))
            .set(crate::schema::planets::focus_verbs.eq(&verbs))
            .execute(conn)?;
        Ok(())
    })
    .await
}

/// Planet ids whose modules already carry authored chunks — what the
/// curriculum seeder skips on a re-run.
pub async fn planets_with_curriculum(pool: &DbPool) -> Result<Vec<Uuid>> {
    run_db(pool, |conn| {
        Ok(planet_lessons::table
            .filter(diesel::dsl::sql::<diesel::sql_types::Bool>(
                "jsonb_array_length(structures) > 0",
            ))
            .select(planet_lessons::planet_id)
            .distinct()
            .load::<Uuid>(conn)?)
    })
    .await
}
