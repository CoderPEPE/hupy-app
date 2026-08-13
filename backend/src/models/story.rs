use crate::schema::{planet_stories, planet_story_seeds};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde_json::Value;
use uuid::Uuid;

/// One learner's personalized audio story for a planet. `sentences` and
/// `translation` hold the ordered transcript units (JSON arrays of strings)
/// in the target and base language respectively, aligned 1:1.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = planet_stories)]
pub struct PlanetStory {
    pub id: Uuid,
    pub user_id: Uuid,
    pub planet_id: Uuid,
    pub title: String,
    pub status: String,
    pub sentences: Value,
    pub translation: Value,
    pub duration_secs: i32,
    pub position_secs: i32,
    pub completed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// The pre-generated story for a planet, shared by everyone on that course.
/// Written by the `seed_stories` binary; a learner's own row is created from
/// it the first time they listen, and only tracks their position.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = planet_story_seeds)]
pub struct PlanetStorySeed {
    pub id: Uuid,
    pub planet_id: Uuid,
    pub title: String,
    pub sentences: Value,
    pub translation: Value,
    pub duration_secs: i32,
    pub source: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
