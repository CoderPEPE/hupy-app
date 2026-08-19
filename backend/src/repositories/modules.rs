//! Per-module curriculum and learner state — the tables behind
//! [`crate::services::curriculum`].

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{ModuleProgress, PlanetLesson};
use crate::schema::{flashcards, module_structure_progress, planet_lessons, user_module_progress};
use chrono::Utc;
use diesel::prelude::*;
use diesel::{Connection, OptionalExtension};
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
                planet_lessons::table.on(planet_lessons::id.eq(user_module_progress::lesson_id)),
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
pub async fn flashcard_counts(pool: &DbPool, user_id: Uuid, lesson_id: Uuid) -> Result<(i64, i64)> {
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

/// How many successful productions the learner has logged for each structure
/// of one module, keyed by the structure's target text. Missing keys mean
/// zero — nothing has been produced yet (no row is created until the first
/// `record_production` call).
pub async fn structure_progress(
    pool: &DbPool,
    user_id: Uuid,
    lesson_id: Uuid,
) -> Result<HashMap<String, i32>> {
    run_db(pool, move |conn| {
        let rows: Vec<(String, i32)> = module_structure_progress::table
            .filter(module_structure_progress::user_id.eq(user_id))
            .filter(module_structure_progress::lesson_id.eq(lesson_id))
            .select((
                module_structure_progress::structure_key,
                module_structure_progress::productions,
            ))
            .load(conn)?;
        Ok(rows.into_iter().collect())
    })
    .await
}

/// The same production counts across every module of one planet — the
/// planet-detail endpoint needs all of them at once instead of ten round
/// trips. Keyed by (lesson_id, structure_key).
pub async fn structure_progress_for_planet(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<HashMap<(Uuid, String), i32>> {
    run_db(pool, move |conn| {
        let rows: Vec<(Uuid, String, i32)> = module_structure_progress::table
            .inner_join(
                planet_lessons::table
                    .on(planet_lessons::id.eq(module_structure_progress::lesson_id)),
            )
            .filter(module_structure_progress::user_id.eq(user_id))
            .filter(planet_lessons::planet_id.eq(planet_id))
            .select((
                module_structure_progress::lesson_id,
                module_structure_progress::structure_key,
                module_structure_progress::productions,
            ))
            .load(conn)?;
        Ok(rows.into_iter().map(|(l, k, p)| ((l, k), p)).collect())
    })
    .await
}

/// The result of one `record_production` call — everything the endpoint (and
/// the tutor reading the response) needs to know about the module's state.
pub struct ProductionOutcome {
    /// The structure's new production count (capped at `cap`).
    pub productions: i32,
    /// How many of the module's structures have reached the cap.
    pub done_count: i64,
    /// How many structures the module has in total.
    pub total_count: i64,
    /// True the moment the conversation half of the gate closed — set once,
    /// when the last structure reaches the cap.
    pub conversation_done: bool,
    /// Whether the flashcard half is also already satisfied (no cards were
    /// minted by this module, so there is nothing to review).
    pub flashcards_done: bool,
}

/// Logs one correct production of a module structure and closes the module's
/// conversation the moment every structure has reached the required count.
///
/// This is the deterministic heart of the module gate: the tutor is asked to
/// call it per correct production, so completion stops depending on the model
/// remembering to call `complete_module` — which is how modules got stuck
/// looping forever. The increment, the done-count read and the gate close run
/// in one transaction, so two concurrent calls cannot both see "one short"
/// and double-close (or never close).
pub async fn record_production(
    pool: &DbPool,
    user_id: Uuid,
    lesson_id: Uuid,
    key: &str,
    total: i64,
    cap: i32,
) -> Result<ProductionOutcome> {
    let (key, lesson_id) = (key.to_string(), lesson_id);
    run_db(pool, move |conn| {
        conn.transaction::<_, AppError, _>(|conn| {
            // Read the current count, then write the capped increment — the
            // LEAST-style clamp keeps re-calls on a finished structure from
            // farming an ever-growing number.
            let current: i32 = module_structure_progress::table
                .find((user_id, lesson_id, &key))
                .select(module_structure_progress::productions)
                .first::<i32>(conn)
                .optional()?
                .unwrap_or(0);
            let next = (current + 1).min(cap);
            let now = Utc::now();
            diesel::insert_into(module_structure_progress::table)
                .values((
                    module_structure_progress::user_id.eq(user_id),
                    module_structure_progress::lesson_id.eq(lesson_id),
                    module_structure_progress::structure_key.eq(&key),
                    module_structure_progress::productions.eq(next),
                    module_structure_progress::updated_at.eq(now),
                ))
                .on_conflict((
                    module_structure_progress::user_id,
                    module_structure_progress::lesson_id,
                    module_structure_progress::structure_key,
                ))
                .do_update()
                .set((
                    module_structure_progress::productions.eq(next),
                    module_structure_progress::updated_at.eq(now),
                ))
                .execute(conn)?;

            let done_count: i64 = module_structure_progress::table
                .filter(module_structure_progress::user_id.eq(user_id))
                .filter(module_structure_progress::lesson_id.eq(lesson_id))
                .filter(module_structure_progress::productions.ge(cap))
                .count()
                .get_result(conn)?;

            let was_done = user_module_progress::table
                .find((user_id, lesson_id))
                .select(user_module_progress::conversation_done)
                .first::<bool>(conn)
                .optional()?
                .unwrap_or(false);

            let just_closed = !was_done && done_count >= total;
            let mut flashcards_done = false;
            if just_closed {
                // The conversation half of the gate: same semantics as
                // `complete_conversation` — a module whose conversation
                // minted no cards has nothing to review, so its flashcard
                // half closes at the same moment.
                diesel::insert_into(user_module_progress::table)
                    .values((
                        user_module_progress::user_id.eq(user_id),
                        user_module_progress::lesson_id.eq(lesson_id),
                        user_module_progress::conversation_done.eq(true),
                        user_module_progress::updated_at.eq(now),
                    ))
                    .on_conflict((
                        user_module_progress::user_id,
                        user_module_progress::lesson_id,
                    ))
                    .do_update()
                    .set((
                        user_module_progress::conversation_done.eq(true),
                        user_module_progress::updated_at.eq(now),
                    ))
                    .execute(conn)?;

                let cards_total: i64 = flashcards::table
                    .filter(flashcards::user_id.eq(user_id))
                    .filter(flashcards::lesson_id.eq(lesson_id))
                    .count()
                    .get_result(conn)?;
                if cards_total == 0 {
                    diesel::insert_into(user_module_progress::table)
                        .values((
                            user_module_progress::user_id.eq(user_id),
                            user_module_progress::lesson_id.eq(lesson_id),
                            user_module_progress::flashcards_done.eq(true),
                            user_module_progress::updated_at.eq(now),
                        ))
                        .on_conflict((
                            user_module_progress::user_id,
                            user_module_progress::lesson_id,
                        ))
                        .do_update()
                        .set((
                            user_module_progress::flashcards_done.eq(true),
                            user_module_progress::updated_at.eq(now),
                        ))
                        .execute(conn)?;
                    flashcards_done = true;
                }
            }

            Ok(ProductionOutcome {
                productions: next,
                done_count,
                total_count: total,
                conversation_done: was_done || just_closed,
                flashcards_done,
            })
        })
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
                planet_lessons::table.on(planet_lessons::id.eq(user_module_progress::lesson_id)),
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
