//! Text-to-speech endpoint: cache-first, proxy to OpenAI otherwise.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::extract::State;
use axum::middleware;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", post(tts))
        // Per-IP cap so one account can't burn OpenAI credits at will.
        .route_layer(middleware::from_fn_with_state(
            state,
            crate::middleware::ratelimit::tts_ratelimit,
        ))
}

#[derive(Deserialize)]
pub struct TtsRequest {
    pub text: String,
    /// 0.25 .. 4.0 (optional, defaults to 1.0)
    pub speed: Option<f32>,
    /// An OpenAI TTS voice (optional; defaults to the configured TTS_VOICE).
    /// The app sends a course-appropriate voice so Spanish/Portuguese text is
    /// pronounced natively, not with English phonetics.
    pub voice: Option<String>,
}

/// Generates speech for arbitrary text (flashcards, planet sentences, etc.)
/// by proxying to the OpenAI speech API. The API key never leaves the server
/// and identical requests are served from the DB cache.
async fn tts(
    State(state): State<AppState>,
    AuthUser(_user_id): AuthUser,
    Json(body): Json<TtsRequest>,
) -> Result<impl IntoResponse> {
    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::bad_request("text cannot be empty"));
    }
    if text.len() > 4096 {
        return Err(AppError::bad_request("text too long (max 4096 chars)"));
    }
    if state.openai_api_key().is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    let model = state.config.tts_model.clone();
    let voice = body
        .voice
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| state.config.tts_voice.clone());
    let speed = body.speed.unwrap_or(1.0);
    if !speed.is_finite() {
        return Err(AppError::bad_request("speed must be a finite number"));
    }
    let speed = speed.clamp(0.25, 4.0);
    let key = services::tts::cache_key(&text, &voice, &model, speed);

    // 1) Serve from cache when possible.
    if let Some(bytes) = repositories::tts::audio_by_key(&state.pool, &key).await? {
        tracing::debug!("tts cache hit for {key}");
        return Ok(([(axum::http::header::CONTENT_TYPE, "audio/mpeg")], bytes));
    }

    // 2) Generate via OpenAI.
    let bytes =
        services::tts::synthesize(state.openai_api_key(), &text, &voice, &model, speed).await?;

    // 3) Cache for next time (best-effort — a cache write failure must not
    //    fail the request the user already waited for).
    if let Err(e) = repositories::tts::store_audio(
        &state.pool,
        key,
        text,
        voice,
        model,
        f64::from(speed),
        bytes.clone(),
    )
    .await
    {
        tracing::warn!("failed to cache tts audio: {e:?}");
    }

    Ok(([(axum::http::header::CONTENT_TYPE, "audio/mpeg")], bytes))
}
