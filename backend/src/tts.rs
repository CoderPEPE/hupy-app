use crate::auth::AuthUser;
use crate::db::run_db;
use crate::errors::AppError;
use crate::schema::tts_audio;
use crate::state::AppState;
use axum::extract::State;
use axum::middleware;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use diesel::prelude::*;
use serde::Deserialize;
use serde_json::{json, Value};

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", post(tts))
        // Per-IP cap so one account can't burn OpenAI credits at will.
        .route_layer(middleware::from_fn_with_state(
            state,
            crate::ratelimit::tts_ratelimit,
        ))
}

#[derive(Deserialize)]
pub struct TtsRequest {
    pub text: String,
    /// 0.25 .. 4.0 (optional, defaults to 1.0)
    pub speed: Option<f32>,
}

/// Deterministic 64-bit FNV-1a key over (text, voice, model, speed) — good
/// enough to dedupe generated audio; no crypto needed for a cache key.
fn cache_key(text: &str, voice: &str, model: &str, speed: f32) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{text}\u{1f}{voice}\u{1f}{model}\u{1f}{speed}").bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

#[cfg(test)]
mod tests {
    use super::cache_key;

    #[test]
    fn cache_key_is_deterministic() {
        let a = cache_key("Good morning", "marin", "gpt-4o-mini-tts", 1.0);
        let b = cache_key("Good morning", "marin", "gpt-4o-mini-tts", 1.0);
        assert_eq!(a, b);
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn cache_key_differs_on_text_voice_or_speed() {
        assert_ne!(cache_key("Good morning", "marin", "m", 1.0), cache_key("Good night", "marin", "m", 1.0));
        assert_ne!(cache_key("Good morning", "marin", "m", 1.0), cache_key("Good morning", "alloy", "m", 1.0));
        assert_ne!(cache_key("Good morning", "marin", "m", 1.0), cache_key("Good morning", "marin", "m", 0.9));
    }
}

/// Generates speech for arbitrary text (flashcards, planet sentences, etc.)
/// by proxying to the OpenAI speech API. The API key never leaves the server
/// and identical requests are served from the DB cache.
async fn tts(
    State(state): State<AppState>,
    AuthUser(_user_id): AuthUser,
    Json(body): Json<TtsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::bad_request("text cannot be empty"));
    }
    if text.len() > 4096 {
        return Err(AppError::bad_request("text too long (max 4096 chars)"));
    }
    if state.openai_api_key.is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    let model = std::env::var("TTS_MODEL").unwrap_or_else(|_| "gpt-4o-mini-tts".into());
    let voice = std::env::var("TTS_VOICE").unwrap_or_else(|_| "marin".into());
    let speed = body.speed.unwrap_or(1.0);
    if !speed.is_finite() {
        return Err(AppError::bad_request("speed must be a finite number"));
    }
    let speed = speed.clamp(0.25, 4.0);
    let key = cache_key(&text, &voice, &model, speed);

    // 1) Serve from cache when possible.
    let lookup_key = key.clone();
    let cached: Option<Vec<u8>> = run_db(&state.pool, move |conn| {
        Ok(tts_audio::table
            .find(lookup_key)
            .select(tts_audio::audio)
            .first::<Vec<u8>>(conn)
            .optional()?)
    })
    .await?;
    if let Some(bytes) = cached {
        tracing::debug!("tts cache hit for {key}");
        return Ok((
            [(axum::http::header::CONTENT_TYPE, "audio/mpeg")],
            bytes,
        ));
    }

    // 2) Generate via OpenAI.
    let payload = json!({
        "model": model,
        "voice": voice,
        "input": text,
        "speed": speed,
        "response_format": "mp3",
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(state.openai_api_key.as_str())
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach OpenAI TTS: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let err: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        let message = err.to_string();
        let message: String = message.chars().take(300).collect();
        return Err(AppError::internal(format!(
            "OpenAI TTS failed ({status}): {message}"
        )));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::internal(format!("failed to read TTS audio: {e}")))?
        .to_vec();

    // 3) Cache for next time (best-effort — a cache write failure must not
    //    fail the request the user already waited for).
    let store_key = key.clone();
    let store_text = text.clone();
    let store_voice = voice.clone();
    let store_model = model.clone();
    let store_bytes = bytes.clone();
    run_db(&state.pool, move |conn| {
        diesel::insert_into(tts_audio::table)
            .values((
                tts_audio::cache_key.eq(store_key),
                tts_audio::text.eq(store_text),
                tts_audio::voice.eq(store_voice),
                tts_audio::model.eq(store_model),
                tts_audio::speed.eq(f64::from(speed)),
                tts_audio::audio.eq(store_bytes),
            ))
            .on_conflict(tts_audio::cache_key)
            .do_nothing()
            .execute(conn)?;
        Ok(())
    })
    .await
    .map_err(|e| {
        tracing::warn!("failed to cache tts audio: {e:?}");
    })
    .ok();

    Ok((
        [(axum::http::header::CONTENT_TYPE, "audio/mpeg")],
        bytes,
    ))
}
