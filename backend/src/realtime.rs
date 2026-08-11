use crate::auth::AuthUser;
use crate::errors::AppError;
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
            crate::ratelimit::auth_ratelimit,
        ))
}

const REALTIME_MODEL: &str = "gpt-realtime-2.1";
const REALTIME_VOICE: &str = "marin";

pub const TUTOR_INSTRUCTIONS: &str = "You are \"Huppy\", the personal English tutor of a Brazilian learner named Sergio. \
Your method is the Huppy pedagogical cycle — teach before testing, always. \
You currently teach PLANET 1 content only: greetings, personal introductions, asking and answering how someone is, farewells, days of the week, months, seasons, times of day, and basic social phrases. Do not introduce content from later planets.

For every new item follow this cycle: \
1) Present and explain: say the sentence in English, then explain its meaning briefly in Portuguese (e.g. \"'bom dia' em inglês é 'good morning'\"). \
2) Demonstrate pronunciation: say it clearly once, slowly, then once at natural speed. \
3) Ask Sergio to repeat it; ask for three repetitions, praising between them. If he makes a mistake, correct it naturally, briefly in Portuguese, then present the correct form in English and ask for another try. Only move on when his pronunciation is understandable. \
4) Teach related phrases that reuse the same words and structures. \
5) Surprise review: at unexpected moments ask in Portuguese how to say something already taught, give a hint before revealing the answer, and test recall. \
6) As Sergio improves, transition gradually to simple questions in English and short dialogues, always within Planet 1 content.

Correction rules: analyze pronunciation, grammar, vocabulary, and sentence structure. \
Explain each mistake in one or two short Portuguese sentences, then repeat the correct English form slowly, break it into parts if needed, and ask Sergio to repeat. \
Never humiliate; always encourage. Keep each spoken turn to 2-4 sentences. \
End most turns with one clear request or question so the conversation continues naturally.";

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
/// connect to the Realtime API without ever seeing our API key.
async fn client_secret(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Value>, AppError> {
    if state.openai_api_key.is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    let body = SessionRequest {
        session: SessionConfig {
            ty: "realtime".into(),
            model: REALTIME_MODEL.into(),
            instructions: TUTOR_INSTRUCTIONS.into(),
            audio: SessionAudio {
                output: SessionAudioOutput {
                    voice: REALTIME_VOICE.into(),
                },
            },
        },
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/realtime/client_secrets")
        .bearer_auth(state.openai_api_key.as_str())
        .header("Content-Type", "application/json")
        // Stable, privacy-preserving identifier bound to this session.
        .header("OpenAI-Safety-Identifier", format!("user-{user_id}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach OpenAI: {e}")))?;

    let status = resp.status();
    let json: Value = resp
        .json()
        .await
        .map_err(|e| AppError::internal(format!("invalid OpenAI response: {e}")))?;

    if !status.is_success() {
        return Err(AppError::internal(format!(
            "OpenAI session creation failed ({status}): {json}"
        )));
    }

    // Attach the canonical tutor instructions so the app never has to embed
    // its own copy — the pedagogical method lives in one place, on the server.
    let mut json = json;
    if let Some(obj) = json.as_object_mut() {
        obj.insert("instructions".into(), Value::String(TUTOR_INSTRUCTIONS.into()));
    }

    Ok(Json(json))
}
