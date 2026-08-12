//! Planet-story persistence (one personalized story per user+planet).

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::PlanetStory;
use crate::schema::planet_stories;
use chrono::Utc;
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde_json::{json, Value};
use uuid::Uuid;

fn strings_to_json(items: &[String]) -> Value {
    Value::Array(items.iter().map(|s| json!(s)).collect())
}

/// Creates (or regenerates) a user's story for a planet. The upsert is
/// idempotent — re-running generation replaces the transcript, so finishing
/// more blocks and regenerating never duplicates stories.
///
/// `status` is 'generating' for the placeholder written before the model is
/// called, 'ready' once a transcript exists. Position and completion are left
/// alone on purpose: regenerating a story the learner is part-way through
/// must not silently rewind (or fast-forward) their player.
#[allow(clippy::too_many_arguments)] // one column per argument; a struct would only move the list
pub async fn upsert(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    title: &str,
    sentences: &[String],
    translation: &[String],
    duration_secs: i64,
    status: &str,
) -> Result<PlanetStory> {
    let (title, sentences, translation, status) = (
        title.to_string(),
        strings_to_json(sentences),
        strings_to_json(translation),
        status.to_string(),
    );
    let duration_secs = duration_secs as i32;
    run_db(pool, move |conn| {
        let now = Utc::now();
        Ok(diesel::insert_into(planet_stories::table)
            .values((
                planet_stories::user_id.eq(user_id),
                planet_stories::planet_id.eq(planet_id),
                planet_stories::title.eq(&title),
                planet_stories::status.eq(&status),
                planet_stories::sentences.eq(&sentences),
                planet_stories::translation.eq(&translation),
                planet_stories::duration_secs.eq(duration_secs),
                planet_stories::updated_at.eq(now),
            ))
            .on_conflict((planet_stories::user_id, planet_stories::planet_id))
            .do_update()
            .set((
                planet_stories::title.eq(&title),
                planet_stories::status.eq(&status),
                planet_stories::sentences.eq(&sentences),
                planet_stories::translation.eq(&translation),
                planet_stories::duration_secs.eq(duration_secs),
                planet_stories::updated_at.eq(now),
            ))
            .returning(planet_stories::all_columns)
            .get_result(conn)?)
    })
    .await
}

pub async fn find(pool: &DbPool, user_id: Uuid, planet_id: Uuid) -> Result<Option<PlanetStory>> {
    run_db(pool, move |conn| {
        Ok(planet_stories::table
            .filter(planet_stories::user_id.eq(user_id))
            .filter(planet_stories::planet_id.eq(planet_id))
            .first::<PlanetStory>(conn)
            .optional()?)
    })
    .await
}

/// Persists playback position (and completion) so the player can resume
/// exactly where the learner stopped. Returns None when no story exists.
pub async fn update_progress(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    position_secs: i32,
    completed: bool,
) -> Result<Option<PlanetStory>> {
    run_db(pool, move |conn| {
        Ok(diesel::update(
            planet_stories::table
                .filter(planet_stories::user_id.eq(user_id))
                .filter(planet_stories::planet_id.eq(planet_id)),
        )
        .set((
            planet_stories::position_secs.eq(position_secs),
            planet_stories::completed.eq(completed),
            planet_stories::updated_at.eq(Utc::now()),
        ))
        .returning(planet_stories::all_columns)
        .get_result::<PlanetStory>(conn)
        .optional()?)
    })
    .await
}

/// All of a user's stories, keyed by planet id by the caller.
pub async fn list_for_user(pool: &DbPool, user_id: Uuid) -> Result<Vec<PlanetStory>> {
    run_db(pool, move |conn| {
        Ok(planet_stories::table
            .filter(planet_stories::user_id.eq(user_id))
            .load::<PlanetStory>(conn)?)
    })
    .await
}
