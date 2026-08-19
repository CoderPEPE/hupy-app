//! Pre-generated planet stories — one per planet, shared by every learner on
//! that course. Written by the `seed_stories` binary, read by the Audio tab.

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::PlanetStorySeed;
use crate::schema::{planet_story_seeds, planets};
use chrono::Utc;
use diesel::prelude::*;
use serde_json::{json, Value};
use uuid::Uuid;

fn strings_to_json(items: &[String]) -> Value {
    Value::Array(items.iter().map(|s| json!(s)).collect())
}

/// Writes (or replaces) a planet's seeded story. Idempotent, so the seeder
/// can be re-run to upgrade template stories to model-written ones.
pub async fn upsert(
    pool: &DbPool,
    planet_id: Uuid,
    title: &str,
    sentences: &[String],
    translation: &[String],
    duration_secs: i64,
    source: &str,
) -> Result<PlanetStorySeed> {
    let (title, sentences, translation, source) = (
        title.to_string(),
        strings_to_json(sentences),
        strings_to_json(translation),
        source.to_string(),
    );
    let duration_secs = duration_secs as i32;
    run_db(pool, move |conn| {
        let now = Utc::now();
        Ok(diesel::insert_into(planet_story_seeds::table)
            .values((
                planet_story_seeds::planet_id.eq(planet_id),
                planet_story_seeds::title.eq(&title),
                planet_story_seeds::sentences.eq(&sentences),
                planet_story_seeds::translation.eq(&translation),
                planet_story_seeds::duration_secs.eq(duration_secs),
                planet_story_seeds::source.eq(&source),
                planet_story_seeds::updated_at.eq(now),
            ))
            .on_conflict(planet_story_seeds::planet_id)
            .do_update()
            .set((
                planet_story_seeds::title.eq(&title),
                planet_story_seeds::sentences.eq(&sentences),
                planet_story_seeds::translation.eq(&translation),
                planet_story_seeds::duration_secs.eq(duration_secs),
                planet_story_seeds::source.eq(&source),
                planet_story_seeds::updated_at.eq(now),
            ))
            .returning(planet_story_seeds::all_columns)
            .get_result(conn)?)
    })
    .await
}

pub async fn find(pool: &DbPool, planet_id: Uuid) -> Result<Option<PlanetStorySeed>> {
    run_db(pool, move |conn| {
        Ok(planet_story_seeds::table
            .filter(planet_story_seeds::planet_id.eq(planet_id))
            .select(planet_story_seeds::all_columns)
            .first::<PlanetStorySeed>(conn)
            .optional()?)
    })
    .await
}

/// What the list endpoint needs about a seed: enough to render a library
/// row, and deliberately *not* the transcript.
#[derive(Debug, Clone, diesel::Queryable)]
pub struct StorySeedSummary {
    pub planet_id: Uuid,
    pub id: Uuid,
    pub title: String,
    pub duration_secs: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Seed summaries for one course — the library list.
///
/// Scoped to the learner's course and stripped of the `sentences` /
/// `translation` JSONB on purpose: the table holds a seed per planet across
/// every course, each one a full narration plus its translation, so loading
/// all columns for all courses moved tens of megabytes per request and threw
/// away everything but one course's worth. Transcripts are served by
/// `find` (the single-story endpoint) when a learner actually opens a story.
pub async fn summaries_for_course(
    pool: &DbPool,
    base_language: &str,
    language: &str,
) -> Result<Vec<StorySeedSummary>> {
    let base = base_language.to_string();
    let lang = language.to_string();
    run_db(pool, move |conn| {
        Ok(planet_story_seeds::table
            .inner_join(planets::table.on(planets::id.eq(planet_story_seeds::planet_id)))
            .filter(planets::base_language.eq(base))
            .filter(planets::language.eq(lang))
            .select((
                planet_story_seeds::planet_id,
                planet_story_seeds::id,
                planet_story_seeds::title,
                planet_story_seeds::duration_secs,
                planet_story_seeds::created_at,
                planet_story_seeds::updated_at,
            ))
            .load::<StorySeedSummary>(conn)?)
    })
    .await
}

/// Planet ids that already have a seed — lets the seeder skip them without
/// loading every transcript it is not going to rewrite.
pub async fn seeded_planet_ids(pool: &DbPool) -> Result<Vec<Uuid>> {
    run_db(pool, |conn| {
        Ok(planet_story_seeds::table
            .select(planet_story_seeds::planet_id)
            .load::<Uuid>(conn)?)
    })
    .await
}
