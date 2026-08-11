//! Realtime voice endpoint: mints a short-lived OpenAI Realtime client
//! secret so the mobile app can connect without ever seeing the API key.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::services;
use crate::state::AppState;
use axum::extract::State;
use axum::middleware;
use axum::routing::post;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::Value;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/client-secret", post(client_secret))
        // Same per-IP cap as auth: this endpoint mints ephemeral Realtime
        // tokens, so it must not be freely callable.
        .route_layer(middleware::from_fn_with_state(
            state,
            crate::middleware::ratelimit::auth_ratelimit,
        ))
}

#[derive(Serialize)]
struct SessionRequest {
    session: SessionConfig,
}

#[derive(Serialize)]
struct SessionConfig {
    #[serde(rename = "type")]
    ty: String,
    model: String,
    instructions: String,
    audio: SessionAudio,
    tools: Vec<Value>,
}

#[derive(Serialize)]
struct SessionAudio {
    output: SessionAudioOutput,
}

#[derive(Serialize)]
struct SessionAudioOutput {
    voice: String,
}

/// Mints a short-lived OpenAI Realtime client secret so the mobile app can
/// connect to the Realtime API without ever seeing our API key. The session
/// is scoped to the user's current active planet and carries tool
/// definitions so the model can record corrections, flashcards, and
/// progress as the conversation actually happens.
async fn client_secret(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Value>> {
    if state.openai_api_key().is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    // One pass builds the instructions, the course voice and the language
    // names (a single user lookup) — see `TutorSession`.
    let session = services::realtime::build_session(&state.pool, user_id).await?;
    let instructions = session.instructions.clone();
    let voice = session.voice;
    let tools = services::realtime::tool_schemas(session.target_name, session.base_name);

    let body = SessionRequest {
        session: SessionConfig {
            ty: "realtime".into(),
            model: services::realtime::REALTIME_MODEL.into(),
            instructions: instructions.clone(),
            audio: SessionAudio {
                output: SessionAudioOutput {
                    voice: voice.clone(),
                },
            },
            tools: tools.clone(),
        },
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/realtime/client_secrets")
        .bearer_auth(state.openai_api_key())
        .header("Content-Type", "application/json")
        // Stable, privacy-preserving identifier bound to this session.
        .header("OpenAI-Safety-Identifier", format!("user-{user_id}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach OpenAI: {e}")))?;

    let status = resp.status();
    let mut json: Value = resp
        .json()
        .await
        .map_err(|e| AppError::internal(format!("invalid OpenAI response: {e}")))?;

    if !status.is_success() {
        return Err(AppError::internal(format!(
            "OpenAI session creation failed ({status}): {json}"
        )));
    }

    // Attach the canonical tutor instructions + tools so the app never has to
    // embed its own copy — the pedagogical method lives in one place, on the
    // server, built fresh from the learner's real progress every session.
    // The app re-sends the session config over the WebSocket once connected,
    // so it has to know the voice we picked here — otherwise its own default
    // silently overrides the learner's choice for the whole conversation.
    if let Some(obj) = json.as_object_mut() {
        obj.insert("instructions".into(), Value::String(instructions));
        obj.insert("tools".into(), Value::Array(tools));
        obj.insert("voice".into(), Value::String(voice));
    }

    Ok(Json(json))
}
