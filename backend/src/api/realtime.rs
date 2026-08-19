//! Realtime voice endpoint: mints a short-lived OpenAI Realtime client
//! secret so the mobile app can connect without ever seeing the API key.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::services;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::Json;
use axum::extract::State;
use axum::middleware;
use axum::routing::post;
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

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

/// Optional session-scope hint carried by the client-secret request. The
/// body is entirely optional (the original no-body call still means "the
/// planet-scoped tutor session") — the mobile app sends it only when it
/// wants a free conversation.
#[derive(Deserialize, Default)]
pub struct ClientSecretRequest {
    /// `"generic"` → a free conversation with no planet scope. Any other
    /// value (or absent) → the planet-scoped tutor session.
    #[serde(default)]
    pub mode: Option<String>,
    /// Optional planet to scope a lesson session to; defaults to the
    /// learner's active planet.
    #[serde(default)]
    pub planet_id: Option<Uuid>,
}

/// Mints a short-lived OpenAI Realtime client secret so the mobile app can
/// connect to the Realtime API without ever seeing our API key. By default
/// the session is scoped to the learner's active planet (or the requested
/// `planet_id`) and carries tool definitions so the model can record
/// corrections, flashcards, and progress as the conversation actually
/// happens. With `mode: "generic"` it becomes a free conversation: same
/// tutor, no curriculum context, and no planet-dependent progress tools.
async fn client_secret(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    body: Bytes,
) -> Result<Json<Value>> {
    if state.openai_api_key().is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    // Truly optional: the app posts no body at all for a lesson session, and
    // `Option<Json<_>>` still rejects an empty body when a JSON content-type
    // is set — which turned "mint me a session" into a 400.
    let body: ClientSecretRequest = if body.is_empty() {
        ClientSecretRequest::default()
    } else {
        serde_json::from_slice(&body)
            .map_err(|e| AppError::bad_request(format!("invalid body: {e}")))?
    };
    let generic = body.mode.as_deref() == Some("generic");

    // One pass builds the instructions, the course voice and the language
    // names (a single user lookup) — see `TutorSession`.
    let session =
        services::realtime::build_session(&state.pool, user_id, body.planet_id, generic).await?;
    let instructions = session.instructions.clone();
    let voice = session.voice;
    let tools =
        services::realtime::tool_schemas(session.target_name, session.base_name, !session.generic);

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

    let resp = state
        .http_client
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
