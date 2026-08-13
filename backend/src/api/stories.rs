//! Audio-story endpoints.
//!
//! Stories are pre-generated per planet by the `seed_stories` binary and
//! ship with the database, so the Audio tab plays immediately instead of
//! asking the learner to generate anything. A planet's story is readable
//! once all ten of its modules are finished — the reward at the end of the
//! learning cycle, not something a mastery average lets slip out early.
//!
//! The per-user `planet_stories` row is only about playback: it is created
//! from the seed the first time someone saves a position, so resume works
//! without copying the curriculum for every learner up front.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::models::{PlanetStory, PlanetStorySeed};
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_stories))
        .route("/{planet_id}", get(get_story))
        .route("/{planet_id}/progress", post(save_progress))
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct StoryJson {
    pub id: Uuid,
    pub title: String,
    pub status: String,
    /// Ordered transcript units in the target language.
    pub sentences: Vec<String>,
    /// 1:1 base-language translation per unit ('' where unavailable).
    pub translation: Vec<String>,
    pub duration_secs: i32,
    pub position_secs: i32,
    pub completed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn strings(v: &serde_json::Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

impl StoryJson {
    /// The planet's seeded story, carrying this learner's playback position
    /// when they have one. The transcript always comes from the seed, so a
    /// re-seeded story reaches everyone without rewriting their rows.
    fn from_seed(seed: &PlanetStorySeed, progress: Option<&PlanetStory>) -> Self {
        Self {
            id: seed.id,
            title: seed.title.clone(),
            // Seeds are only ever written complete — there is no "generating"
            // state left for the client to poll through.
            status: "ready".into(),
            sentences: strings(&seed.sentences),
            translation: strings(&seed.translation),
            duration_secs: seed.duration_secs,
            position_secs: progress.map(|p| p.position_secs).unwrap_or(0),
            completed: progress.is_some_and(|p| p.completed),
            created_at: seed.created_at,
            updated_at: progress.map_or(seed.updated_at, |p| p.updated_at),
        }
    }
}

#[derive(Serialize)]
pub struct StoryPlanetJson {
    pub id: Uuid,
    pub number: i32,
    pub title: String,
    pub color: String,
    pub level: String,
    pub goal: String,
}

/// One row of the stories list: every planet of the learner's course with
/// its unlock state and story (if generated).
#[derive(Serialize)]
pub struct StoryListEntry {
    pub planet: StoryPlanetJson,
    /// True once every module of the planet is finished (or the learner has
    /// already started listening).
    pub unlocked: bool,
    pub story: Option<StoryJson>,
}

#[derive(Deserialize)]
pub struct ProgressUpdate {
    pub position_secs: i32,
    #[serde(default)]
    pub completed: bool,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// All planets of the user's course with their story state — the Audio tab
/// renders its library from this in one request.
async fn list_stories(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<StoryListEntry>>> {
    let user = repositories::users::find_by_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| AppError::unauthorized("user not found"))?;
    let all =
        repositories::planets::list_for_course(&state.pool, &user.base_language, &user.language)
            .await?;
    let stories = repositories::stories::list_for_user(&state.pool, user_id).await?;
    let by_planet: std::collections::HashMap<Uuid, PlanetStory> =
        stories.into_iter().map(|s| (s.planet_id, s)).collect();
    let seeds = repositories::story_seeds::all(&state.pool).await?;
    let seed_by_planet: std::collections::HashMap<Uuid, PlanetStorySeed> =
        seeds.into_iter().map(|s| (s.planet_id, s)).collect();

    // The story is the planet's reward: it opens when all ten modules are
    // finished (conversation + flashcards each), not when a mastery average
    // crosses a line.
    let completed_modules =
        repositories::modules::completed_counts_by_planet(&state.pool, user_id).await?;

    let mut out = Vec::with_capacity(all.len());
    for p in &all {
        let listened = by_planet.get(&p.id);
        let done = completed_modules.get(&p.id).copied().unwrap_or(0);
        let unlocked =
            listened.is_some() || done >= services::curriculum::MODULES_PER_PLANET as i64;
        // Withheld until then: hearing the planet's story before working
        // through its modules would spoil the point of it.
        let story = if unlocked {
            seed_by_planet
                .get(&p.id)
                .map(|seed| StoryJson::from_seed(seed, listened))
        } else {
            None
        };
        out.push(StoryListEntry {
            planet: StoryPlanetJson {
                id: p.id,
                number: p.number,
                title: p.title.clone(),
                color: p.color.clone(),
                level: p.level.clone(),
                goal: p.goal.clone(),
            },
            unlocked,
            story,
        });
    }
    Ok(Json(out))
}

async fn get_story(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<StoryJson>> {
    let seed = repositories::story_seeds::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("story not found"))?;
    let listened = repositories::stories::find(&state.pool, user_id, planet_id).await?;
    Ok(Json(StoryJson::from_seed(&seed, listened.as_ref())))
}

/// Saves playback position + completion so the player resumes where the
/// learner stopped, even days later.
async fn save_progress(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
    Json(body): Json<ProgressUpdate>,
) -> Result<Json<StoryJson>> {
    let position = body.position_secs.max(0);
    let seed = repositories::story_seeds::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("story not found"))?;

    // First listen: the learner has no row yet. Create one from the seed so
    // there is something to hang the position on — the transcript itself is
    // still read from the seed, this row is only their bookmark.
    if repositories::stories::find(&state.pool, user_id, planet_id)
        .await?
        .is_none()
    {
        repositories::stories::upsert(
            &state.pool,
            user_id,
            planet_id,
            &seed.title,
            &strings(&seed.sentences),
            &strings(&seed.translation),
            i64::from(seed.duration_secs),
            "ready",
        )
        .await?;
    }

    let listened = repositories::stories::update_progress(
        &state.pool,
        user_id,
        planet_id,
        position,
        body.completed,
    )
    .await?;
    Ok(Json(StoryJson::from_seed(&seed, listened.as_ref())))
}
