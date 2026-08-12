//! Flashcard endpoints (CRUD + spaced-repetition reviews + live re-verification).

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::models::{Card, NewCard};
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_flashcards).post(create_flashcard))
        .route("/{id}", axum::routing::delete(delete_flashcard))
        .route("/{id}/review", axum::routing::post(review_flashcard))
        .route(
            "/{id}/confirm-live-mastery",
            axum::routing::post(confirm_live_mastery),
        )
        .route(
            "/corrections/{correction_id}/flashcard",
            axum::routing::post(correction_to_card),
        )
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct CardJson {
    pub id: Uuid,
    pub en: String,
    pub pt: String,
    pub explanation: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub planet_id: Option<Uuid>,
    pub correction_id: Option<Uuid>,
    pub source: String,
    pub interval_days: i32,
    pub ease: f64,
    pub repetitions: i32,
    pub next_review_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    /// true when the card is due for review right now
    pub due: bool,
    /// most recent rating, if any
    pub last_rating: Option<String>,
    /// false when the card was rated "easy" but the tutor hasn't re-tested it
    /// live yet — a self-report alone never counts as mastered.
    pub verified_live: bool,
}

impl CardJson {
    fn from_card(c: &Card, last_rating: Option<String>) -> Self {
        Self {
            id: c.id,
            en: c.en.clone(),
            pt: c.pt.clone(),
            explanation: c.explanation.clone(),
            subject: c.subject.clone(),
            verb: c.verb.clone(),
            complement: c.complement.clone(),
            planet_id: c.planet_id,
            correction_id: c.correction_id,
            source: c.source.clone(),
            interval_days: c.interval_days,
            ease: c.ease,
            repetitions: c.repetitions,
            next_review_at: c.next_review_at,
            created_at: c.created_at,
            due: c.next_review_at <= Utc::now(),
            last_rating,
            verified_live: c.verified_live,
        }
    }
}

#[derive(Deserialize)]
pub struct CardQuery {
    pub planet_id: Option<Uuid>,
    /// when true, only cards due now are returned
    pub due: Option<bool>,
}

#[derive(Deserialize)]
pub struct CreateCard {
    pub en: String,
    pub pt: String,
    pub explanation: Option<String>,
    pub subject: Option<String>,
    pub verb: Option<String>,
    pub complement: Option<String>,
    pub planet_id: Option<Uuid>,
    pub source: Option<String>,
}

#[derive(Deserialize)]
pub struct ReviewRequest {
    /// "hard" | "medium" | "easy"
    pub rating: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_flashcards(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(q): Query<CardQuery>,
) -> Result<Json<Vec<CardJson>>> {
    let out = repositories::flashcards::list_with_ratings(
        &state.pool,
        user_id,
        q.planet_id,
        q.due.unwrap_or(false),
    )
    .await?
    .into_iter()
    .map(|(c, rating)| CardJson::from_card(&c, rating))
    .collect::<Vec<_>>();

    Ok(Json(out))
}

async fn create_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateCard>,
) -> Result<(StatusCode, Json<CardJson>)> {
    if body.en.trim().is_empty() || body.pt.trim().is_empty() {
        return Err(AppError::bad_request("en and pt cannot be empty"));
    }
    if body.en.len() > 512 || body.pt.len() > 512 {
        return Err(AppError::bad_request(
            "en and pt too long (max 512 chars each)",
        ));
    }
    if body.explanation.as_deref().is_some_and(|e| e.len() > 2000) {
        return Err(AppError::bad_request(
            "explanation too long (max 2000 chars)",
        ));
    }
    // Structure fields map to VARCHAR columns — keep them within bounds.
    if body.subject.as_deref().is_some_and(|s| s.len() > 128)
        || body.verb.as_deref().is_some_and(|v| v.len() > 128)
        || body.complement.as_deref().is_some_and(|c| c.len() > 512)
    {
        return Err(AppError::bad_request("structure fields too long"));
    }
    if body.source.as_deref().is_some_and(|s| s.len() > 32) {
        return Err(AppError::bad_request("source too long (max 32 chars)"));
    }

    let card = repositories::flashcards::insert(
        &state.pool,
        &NewCard {
            user_id,
            planet_id: body.planet_id,
            correction_id: None,
            en: body.en,
            pt: body.pt,
            explanation: body.explanation.unwrap_or_default(),
            subject: body.subject.unwrap_or_default(),
            verb: body.verb.unwrap_or_default(),
            complement: body.complement.unwrap_or_default(),
            source: body.source.unwrap_or_else(|| "manual".into()),
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(CardJson::from_card(&card, None))))
}

/// Records a review and reschedules the card via spaced repetition.
async fn review_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ReviewRequest>,
) -> Result<Json<CardJson>> {
    if !matches!(body.rating.as_str(), "hard" | "medium" | "easy") {
        return Err(AppError::bad_request(
            "rating must be 'hard', 'medium' or 'easy'",
        ));
    }

    // "easy" is a self-report — don't trust it until the tutor re-tests the
    // content live (spec: the AI must confirm mastery, not just take the
    // learner's word for it).
    let just_claimed_easy = body.rating == "easy";

    let card = repositories::flashcards::find_owned(&state.pool, user_id, id).await?;
    let schedule = services::flashcards::schedule(
        &body.rating,
        card.interval_days,
        card.ease,
        card.repetitions,
    );
    let verified_live = !just_claimed_easy && card.verified_live;

    let (updated, last_rating) = repositories::flashcards::record_review(
        &state.pool,
        user_id,
        id,
        &body.rating,
        schedule,
        verified_live,
    )
    .await?;

    if let Some(planet_id) = updated.planet_id {
        let metric =
            repositories::flashcards::flashcards_metric(&state.pool, user_id, planet_id).await?;
        services::planets::set_metric_absolute(
            &state.pool,
            user_id,
            planet_id,
            "flashcards",
            metric,
        )
        .await?;
    }

    services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 2).await;

    Ok(Json(CardJson::from_card(&updated, last_rating)))
}

/// Re-confirms a flashcard the tutor has successfully quizzed live after it
/// was rated "easy" — clears the pending-reverification flag.
async fn confirm_live_mastery(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<CardJson>> {
    let (updated, last_rating) =
        repositories::flashcards::confirm_live(&state.pool, user_id, id).await?;

    if let Some(planet_id) = updated.planet_id {
        let metric =
            repositories::flashcards::flashcards_metric(&state.pool, user_id, planet_id).await?;
        services::planets::set_metric_absolute(
            &state.pool,
            user_id,
            planet_id,
            "flashcards",
            metric,
        )
        .await?;
    }

    Ok(Json(CardJson::from_card(&updated, last_rating)))
}

async fn delete_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    repositories::flashcards::delete(&state.pool, user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Turns a saved correction into a flashcard (the "Make a card" action).
async fn correction_to_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(correction_id): Path<Uuid>,
) -> Result<(StatusCode, Json<CardJson>)> {
    let card =
        repositories::flashcards::create_from_correction(&state.pool, user_id, correction_id)
            .await?;

    Ok((StatusCode::CREATED, Json(CardJson::from_card(&card, None))))
}
