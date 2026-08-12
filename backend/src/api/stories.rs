//! Personalized audio-story endpoints.
//!
//! A story is generated per (user, planet) once the planet is conquered
//! (mastery >= unlock threshold). The generated story is deterministic and
//! server-side — no model call — so it works offline of any AI provider and
//! stays consistent with the learner's actual studied sentences.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::models::{Planet, PlanetStory};
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
        .route("/{planet_id}/generate", post(generate_story))
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

impl From<&PlanetStory> for StoryJson {
    fn from(s: &PlanetStory) -> Self {
        fn strings(v: &serde_json::Value) -> Vec<String> {
            v.as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default()
        }
        Self {
            id: s.id,
            title: s.title.clone(),
            status: s.status.clone(),
            sentences: strings(&s.sentences),
            translation: strings(&s.translation),
            duration_secs: s.duration_secs,
            position_secs: s.position_secs,
            completed: s.completed,
            created_at: s.created_at,
            updated_at: s.updated_at,
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
    /// True once the planet is conquered (or its story already exists).
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

    let mut out = Vec::with_capacity(all.len());
    for p in &all {
        let progress = repositories::planets::load_progress(&state.pool, user_id, p.id).await?;
        let story = by_planet.get(&p.id);
        let unlocked = story.is_some() || services::planets::is_conquered(&progress, p.unlock_mastery);
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
            story: story.map(StoryJson::from),
        });
    }
    Ok(Json(out))
}

async fn get_story(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<StoryJson>> {
    repositories::stories::find(&state.pool, user_id, planet_id)
        .await?
        .map(|s| Json(StoryJson::from(&s)))
        .ok_or_else(|| AppError::not_found("story not found"))
}

/// Generates (or regenerates) the personalized story for a conquered planet.
/// Unlocking requires the planet to be completed — exactly the rule that
/// marks the planet conquered, so a story is only ever earned for real.
async fn generate_story(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<StoryJson>> {
    let planet: Planet = repositories::planets::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("planet not found"))?;

    let progress = repositories::planets::load_progress(&state.pool, user_id, planet_id).await?;
    let already = repositories::stories::find(&state.pool, user_id, planet_id).await?;
    if already.is_none() && !services::planets::is_conquered(&progress, planet.unlock_mastery) {
        return Err(AppError::conflict(
            "complete this planet to unlock its story",
        ));
    }

    let user = repositories::users::find_by_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| AppError::unauthorized("user not found"))?;
    let name = user.name;
    let sentences = repositories::planets::tutor_sentences(
        &state.pool,
        user_id,
        planet_id,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    // The story is cumulative (spec): mostly this planet, with important
    // phrases from earlier planets woven back in for review.
    let review = repositories::planets::cumulative_review_sample(
        &state.pool,
        user_id,
        planet.number,
        services::stories::REVIEW_SENTENCES,
        &planet.base_language,
        &planet.language,
    )
    .await?;

    // Without an API key there is no AI writer — fall back to the template
    // immediately so the learner still gets their story, synchronously.
    if state.openai_api_key().is_empty() {
        let story = services::stories::build_story(&planet, &sentences, &review, &name);
        let saved = save_story(&state, user_id, planet_id, story, "ready").await?;
        return Ok(Json(StoryJson::from(&saved)));
    }

    // A 10–20 minute narrative takes far longer to write than a request should
    // hang for, so the story is marked "generating" and finished in the
    // background; the Audio tab polls until it turns "ready".
    let placeholder = repositories::stories::upsert(
        &state.pool,
        user_id,
        planet_id,
        &format!("{} — My Story", planet.title),
        &[],
        &[],
        0,
        "generating",
    )
    .await?;

    let (target_name, base_name) =
        services::realtime::language_names(&planet.base_language, &planet.language);
    let prompt = services::stories::story_prompt(
        &planet,
        &sentences,
        &review,
        &name,
        target_name,
        base_name,
    );
    let bg = state.clone();
    tokio::spawn(async move {
        let written = services::stories::generate_with_ai(
            &bg.http_client,
            bg.openai_api_key(),
            &bg.config.story_model,
            &planet,
            &prompt,
        )
        .await;
        let story = match written {
            Ok(s) => s,
            Err(e) => {
                // A model failure must not leave the planet without a story —
                // the deterministic writer always produces a playable one.
                tracing::warn!("AI story generation failed, using the template: {e:?}");
                services::stories::build_story(&planet, &sentences, &review, &name)
            }
        };
        if let Err(e) = save_story(&bg, user_id, planet_id, story, "ready").await {
            tracing::error!("failed to persist generated story: {e:?}");
        }
    });

    Ok(Json(StoryJson::from(&placeholder)))
}

/// Persists a finished story transcript.
async fn save_story(
    state: &AppState,
    user_id: Uuid,
    planet_id: Uuid,
    story: services::stories::StoryText,
    status: &str,
) -> Result<PlanetStory> {
    repositories::stories::upsert(
        &state.pool,
        user_id,
        planet_id,
        &story.title,
        &story.sentences,
        &story.translation,
        story.duration_secs,
        status,
    )
    .await
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
    repositories::stories::update_progress(
        &state.pool,
        user_id,
        planet_id,
        position,
        body.completed,
    )
    .await?
    .map(|s| Json(StoryJson::from(&s)))
    .ok_or_else(|| AppError::not_found("story not found"))
}
