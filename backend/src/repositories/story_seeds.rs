//! Pre-generated planet stories — one per planet, shared by every learner on
//! that course. Written by the `seed_stories` binary, read by the Audio tab.

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::PlanetStorySeed;
use crate::schema::planet_story_seeds;
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

/// Every seed, for the list endpoint — one query instead of one per planet.
pub async fn all(pool: &DbPool) -> Result<Vec<PlanetStorySeed>> {
    run_db(pool, |conn| {
        Ok(planet_story_seeds::table
            .select(planet_story_seeds::all_columns)
            .load::<PlanetStorySeed>(conn)?)
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
