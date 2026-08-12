//! Planet course-content and progress persistence.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{LessonStep, Planet, PlanetProgress, Sentence, TutorSentence};
use crate::schema::{
    lesson_steps, planet_lessons, planet_sentences, planets, user_planet_progress,
    user_sentence_progress,
};
use diesel::prelude::*;
use diesel::OptionalExtension;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Planets & counts
// ---------------------------------------------------------------------------

/// Every planet of one course, in path order. A course is the ordered pair
/// (base_language, language): the same Mercury..Neptune path exists for each
/// base→target combination, so filtering must use both.
pub async fn list_for_course(
    pool: &DbPool,
    base_language: &str,
    language: &str,
) -> Result<Vec<Planet>> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        Ok(planets::table
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .order(planets::number.asc())
            .load(conn)?)
    })
    .await
}

pub async fn find(pool: &DbPool, planet_id: Uuid) -> Result<Option<Planet>> {
    run_db(pool, move |conn| {
        Ok(planets::table.find(planet_id).first(conn).optional()?)
    })
    .await
}

/// The planet immediately before `number` in the same course (the
/// highest-numbered planet below it, within the same base→target pair), if
/// any — used to compute lock/unlock state. Without the pair filter the six
/// parallel courses would see each other's planets as their predecessors.
pub async fn previous_planet(
    pool: &DbPool,
    number: i32,
    base_language: &str,
    language: &str,
) -> Result<Option<Planet>> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        Ok(planets::table
            .filter(planets::number.lt(number))
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .order(planets::number.desc())
            .first(conn)
            .optional()?)
    })
    .await
}

/// Real counts of what one course contains: (planets, sentences, lessons).
/// The pre-login screens quote these figures, so they must reflect the
/// course being promoted, not all three courses at once.
pub async fn catalog_counts(
    pool: &DbPool,
    base_language: &str,
    language: &str,
) -> Result<(i64, i64, i64)> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        let planets_count: i64 = planets::table
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .count()
            .get_result(conn)?;
        let sentences: i64 = planet_sentences::table
            .inner_join(planets::table.on(planets::id.eq(planet_sentences::planet_id)))
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .count()
            .get_result(conn)?;
        let lessons: i64 = planet_lessons::table
            .inner_join(planets::table.on(planets::id.eq(planet_lessons::planet_id)))
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .count()
            .get_result(conn)?;
        Ok((planets_count, sentences, lessons))
    })
    .await
}

pub async fn sentence_count(pool: &DbPool, planet_id: Uuid) -> Result<i64> {
    run_db(pool, move |conn| {
        Ok(planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?)
    })
    .await
}

/// (planet_id, sentence count) for every planet, in one grouped query.
pub async fn sentence_totals_by_planet(pool: &DbPool) -> Result<Vec<(Uuid, i64)>> {
    run_db(pool, move |conn| {
        Ok(planet_sentences::table
            .group_by(planet_sentences::planet_id)
            .select((
                planet_sentences::planet_id,
                diesel::dsl::count(planet_sentences::id),
            ))
            .load::<(Uuid, i64)>(conn)?)
    })
    .await
}

/// (planet_id, mastered sentence count) for a user, in one grouped query.
pub async fn mastered_counts_by_planet(pool: &DbPool, user_id: Uuid) -> Result<Vec<(Uuid, i64)>> {
    run_db(pool, move |conn| {
        Ok(user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .group_by(planet_sentences::planet_id)
            .select((
                planet_sentences::planet_id,
                diesel::dsl::count(planet_sentences::id),
            ))
            .load(conn)?)
    })
    .await
}

/// (planet number, title) — used for auto-titling conversations.
pub async fn planet_number_and_title(
    pool: &DbPool,
    planet_id: Uuid,
) -> Result<Option<(i32, String)>> {
    run_db(pool, move |conn| {
        Ok(planets::table
            .find(planet_id)
            .select((planets::number, planets::title))
            .first::<(i32, String)>(conn)
            .optional()?)
    })
    .await
}

// ---------------------------------------------------------------------------
// Course content
// ---------------------------------------------------------------------------

pub async fn sentences_for(pool: &DbPool, planet_id: Uuid) -> Result<Vec<Sentence>> {
    run_db(pool, move |conn| {
        Ok(planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .order(planet_sentences::position.asc())
            .load::<Sentence>(conn)?)
    })
    .await
}

/// (id, position, kind, title, description) for a planet's lesson path,
/// in path order (Learn -> Practice -> Test -> Master).
pub async fn lesson_rows(
    pool: &DbPool,
    planet_id: Uuid,
) -> Result<Vec<(Uuid, i32, String, String, String)>> {
    run_db(pool, move |conn| {
        Ok(planet_lessons::table
            .filter(planet_lessons::planet_id.eq(planet_id))
            .order(planet_lessons::position.asc())
            .select((
                planet_lessons::id,
                planet_lessons::position,
                planet_lessons::kind,
                planet_lessons::title,
                planet_lessons::description,
            ))
            .load(conn)?)
    })
    .await
}

pub async fn lesson_steps_for(pool: &DbPool, planet_id: Uuid) -> Result<Vec<LessonStep>> {
    run_db(pool, move |conn| {
        Ok(lesson_steps::table
            .filter(lesson_steps::planet_id.eq(planet_id))
            .order(lesson_steps::position.asc())
            .load::<LessonStep>(conn)?)
    })
    .await
}

// ---------------------------------------------------------------------------
// Sentence mastery
// ---------------------------------------------------------------------------

pub async fn mastered_sentence_count(pool: &DbPool, user_id: Uuid, planet_id: Uuid) -> Result<i64> {
    run_db(pool, move |conn| {
        Ok(user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?)
    })
    .await
}

/// Ids of the sentences a user has mastered on a planet (no N+1).
pub async fn mastered_sentence_ids(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<Vec<Uuid>> {
    run_db(pool, move |conn| {
        Ok(user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .select(user_sentence_progress::sentence_id)
            .load(conn)?)
    })
    .await
}

/// Marks a sentence mastered (or not) and returns the planet's new
/// (mastered, total) counts. Runs the ownership check, the upsert and the
/// counts on one connection so they can't interleave with another write.
pub async fn mark_sentence_mastered(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    sentence_id: Uuid,
    mastered: bool,
) -> Result<(i64, i64)> {
    run_db(pool, move |conn| {
        // The sentence must exist and belong to the given planet.
        let belongs: i64 = planet_sentences::table
            .filter(planet_sentences::id.eq(sentence_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;
        if belongs == 0 {
            return Err(AppError::not_found("sentence not found in this planet"));
        }

        diesel::insert_into(user_sentence_progress::table)
            .values((
                user_sentence_progress::user_id.eq(user_id),
                user_sentence_progress::sentence_id.eq(sentence_id),
                user_sentence_progress::mastered.eq(mastered),
            ))
            .on_conflict((
                user_sentence_progress::user_id,
                user_sentence_progress::sentence_id,
            ))
            .do_update()
            .set(user_sentence_progress::mastered.eq(mastered))
            .execute(conn)?;

        let mastered_count: i64 = user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?;
        let total: i64 = planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;

        Ok((mastered_count, total))
    })
    .await
}

// ---------------------------------------------------------------------------
// Planet progress
// ---------------------------------------------------------------------------

/// Loads a planet's progress row for a user (defaults to zeros).
pub async fn load_progress(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<PlanetProgress> {
    run_db(pool, move |conn| {
        Ok(user_planet_progress::table
            .find((user_id, planet_id))
            .first::<PlanetProgress>(conn)
            .optional()?
            .unwrap_or_else(|| PlanetProgress::empty(planet_id)))
    })
    .await
}

/// All of a user's progress rows, keyed by planet id by the caller.
pub async fn all_progress_for(pool: &DbPool, user_id: Uuid) -> Result<Vec<PlanetProgress>> {
    run_db(pool, move |conn| {
        Ok(user_planet_progress::table
            .filter(user_planet_progress::user_id.eq(user_id))
            .load(conn)?)
    })
    .await
}

/// Upserts a progress row (insert on first touch, update afterwards).
pub async fn store_progress(pool: &DbPool, user_id: Uuid, p: PlanetProgress) -> Result<()> {
    let planet_id = p.planet_id;
    run_db(pool, move |conn| {
        diesel::insert_into(user_planet_progress::table)
            .values((
                user_planet_progress::user_id.eq(user_id),
                user_planet_progress::planet_id.eq(planet_id),
                user_planet_progress::sentences.eq(p.sentences),
                user_planet_progress::pronunciation.eq(p.pronunciation),
                user_planet_progress::conversation.eq(p.conversation),
                user_planet_progress::listening.eq(p.listening),
                user_planet_progress::flashcards.eq(p.flashcards),
                user_planet_progress::review.eq(p.review),
                user_planet_progress::mastery.eq(p.mastery),
            ))
            .on_conflict((
                user_planet_progress::user_id,
                user_planet_progress::planet_id,
            ))
            .do_update()
            .set((
                user_planet_progress::sentences.eq(p.sentences),
                user_planet_progress::pronunciation.eq(p.pronunciation),
                user_planet_progress::conversation.eq(p.conversation),
                user_planet_progress::listening.eq(p.listening),
                user_planet_progress::flashcards.eq(p.flashcards),
                user_planet_progress::review.eq(p.review),
                user_planet_progress::mastery.eq(p.mastery),
            ))
            .execute(conn)?;
        Ok(())
    })
    .await
}

// ---------------------------------------------------------------------------
// Tutor session content (Realtime prompt building)
// ---------------------------------------------------------------------------

pub async fn tutor_sentences(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    base_language: &str,
    language: &str,
) -> Result<Vec<TutorSentence>> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        let mastered_ids: std::collections::HashSet<Uuid> = user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .select(user_sentence_progress::sentence_id)
            .load(conn)?
            .into_iter()
            .collect();

        // The target text lives in a different column per course, with the
        // base translation in another slot. The struct fields are reused:
        // `en` = target (front), `pt` = base (back). The (base, target) pair
        // decides, so every one of the six courses reads the right columns.
        let query = planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .order(planet_sentences::position.asc());
        let rows: Vec<(Uuid, String, String, String, String, String)> =
            match (language.as_str(), base_language.as_str()) {
                ("es", "pt") => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::es,
                        planet_sentences::pt,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
                ("pt", "en") => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::pt,
                        planet_sentences::en,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
                ("en", "es") => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::en,
                        planet_sentences::es,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
                ("es", "en") => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::es,
                        planet_sentences::en,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
                ("pt", "es") => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::pt,
                        planet_sentences::es,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
                // ("en", "pt") and any legacy fallback
                _ => query
                    .select((
                        planet_sentences::id,
                        planet_sentences::en,
                        planet_sentences::pt,
                        planet_sentences::subject,
                        planet_sentences::verb,
                        planet_sentences::complement,
                    ))
                    .load(conn)?,
            };

        Ok(rows
            .into_iter()
            .map(|(id, en, pt, subject, verb, complement)| TutorSentence {
                mastered: mastered_ids.contains(&id),
                id,
                en,
                pt,
                subject,
                verb,
                complement,
            })
            .collect())
    })
    .await
}

/// A sample of sentences the user already mastered on earlier (lower-numbered)
/// planets of the same course, for the tutor to weave in as cumulative
/// review. Returns (target, base) text pairs like `tutor_sentences`.
pub async fn cumulative_review_sample(
    pool: &DbPool,
    user_id: Uuid,
    before_planet_number: i32,
    limit: i64,
    base_language: &str,
    language: &str,
) -> Result<Vec<(String, String)>> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        let query = user_sentence_progress::table
            .inner_join(
                planet_sentences::table
                    .on(planet_sentences::id.eq(user_sentence_progress::sentence_id)),
            )
            .inner_join(planets::table.on(planets::id.eq(planet_sentences::planet_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .filter(planets::number.lt(before_planet_number))
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .order(planets::number.desc())
            .limit(limit);
        let rows: Vec<(String, String)> =
            match (language.as_str(), base_language.as_str()) {
                ("es", "pt") => query
                    .select((planet_sentences::es, planet_sentences::pt))
                    .load(conn)?,
                ("pt", "en") => query
                    .select((planet_sentences::pt, planet_sentences::en))
                    .load(conn)?,
                ("en", "es") => query
                    .select((planet_sentences::en, planet_sentences::es))
                    .load(conn)?,
                ("es", "en") => query
                    .select((planet_sentences::es, planet_sentences::en))
                    .load(conn)?,
                ("pt", "es") => query
                    .select((planet_sentences::pt, planet_sentences::es))
                    .load(conn)?,
                // ("en", "pt") and any legacy fallback
                _ => query
                    .select((planet_sentences::en, planet_sentences::pt))
                    .load(conn)?,
            };
        Ok(rows)
    })
    .await
}
