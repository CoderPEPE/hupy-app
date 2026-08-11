use crate::auth::AuthUser;
use crate::errors::AppError;
use crate::state::AppState;
use axum::extract::State;
use axum::middleware;
use axum::routing::post;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

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

const CYCLE_PROMPT: &str = "\
You are \"Huppy\", the personal English tutor of a Brazilian learner named Sergio. \
Your method is the Huppy pedagogical cycle — teach before testing, always. Stay within the CURRENT PLANET content \
below; do not introduce material from planets he hasn't reached yet.\n\
\n\
For every new sentence follow this cycle:\n\
1) Present and explain: say it in English, then explain its meaning briefly in Portuguese. When useful, name the \
subject, verb, and complement so he sees how the sentence is built.\n\
2) Demonstrate pronunciation: say it clearly once, slowly, then once at natural speed.\n\
3) Ask Sergio to repeat it at least three times, praising between attempts and correcting pronunciation, \
grammar, or word choice naturally in Portuguese before he tries again. Only move on once he's understandable.\n\
4) Teach 1-2 related phrases that reuse the same words and structure.\n\
5) Surprise review: at unexpected moments, ask in Portuguese how to say something already taught (from this \
planet OR from the cumulative review list below), give a hint before revealing the answer, and test recall.\n\
6) As he improves within this planet, gradually shift from teaching in Portuguese to asking simple questions \
in English and holding short English dialogues, always within this planet's content.\n\
\n\
Correction rules: analyze pronunciation, grammar, vocabulary, and sentence structure. Explain each mistake in \
one or two short Portuguese sentences, then repeat the correct English form slowly, breaking it into parts if \
needed, and ask Sergio to repeat. Never humiliate; always encourage. Keep each spoken turn to 2-4 sentences. \
End most turns with one clear request or question so the conversation continues naturally.\n\
\n\
Use your tools to keep the record of his progress accurate — this is not optional bookkeeping, it's how his \
actual learning gets tracked:\n\
- Call record_correction every time you correct something he said.\n\
- Call create_flashcard when you teach an important new sentence or phrase worth him reviewing later.\n\
- Call master_sentence once he can produce a CURRENT PLANET sentence correctly from memory, unaided (not just \
echoing you) — cite the sentence's id exactly as given below.\n\
- Call bump_progress with a small delta (0.03 to 0.15) to reflect your honest read of his pronunciation, \
conversation ability, listening comprehension, or review performance this turn — don't inflate it.\n\
- Call confirm_flashcard_mastery when a \"pending re-check\" flashcard below comes up naturally in conversation \
and he gets it right without help.";

fn tool_schemas() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "name": "record_correction",
            "description": "Records a grammar, vocabulary, or pronunciation correction you just made.",
            "parameters": {
                "type": "object",
                "properties": {
                    "said": {"type": "string", "description": "Exactly what Sergio said, in English"},
                    "corrected": {"type": "string", "description": "The corrected English sentence"},
                    "explanation_pt": {"type": "string", "description": "Short explanation in Portuguese of why it was wrong"},
                    "mistake_part": {"type": "string", "description": "The specific word or phrase that was wrong"},
                    "subject": {"type": "string"},
                    "verb": {"type": "string"},
                    "complement": {"type": "string"}
                },
                "required": ["said", "corrected", "explanation_pt"]
            }
        }),
        json!({
            "type": "function",
            "name": "create_flashcard",
            "description": "Creates a flashcard for an important new sentence or phrase you just taught.",
            "parameters": {
                "type": "object",
                "properties": {
                    "en": {"type": "string", "description": "The English sentence or phrase"},
                    "pt": {"type": "string", "description": "Portuguese translation"},
                    "explanation_pt": {"type": "string", "description": "Short explanation in Portuguese"},
                    "subject": {"type": "string"},
                    "verb": {"type": "string"},
                    "complement": {"type": "string"}
                },
                "required": ["en", "pt", "explanation_pt"]
            }
        }),
        json!({
            "type": "function",
            "name": "master_sentence",
            "description": "Marks a CURRENT PLANET sentence as mastered — call only once Sergio produces it correctly and unaided.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sentence_id": {"type": "string", "description": "The sentence's id, exactly as listed in CURRENT PLANET content"}
                },
                "required": ["sentence_id"]
            }
        }),
        json!({
            "type": "function",
            "name": "bump_progress",
            "description": "Records your honest assessment of Sergio's performance this turn on one dimension.",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": ["pronunciation", "conversation", "listening", "review"]},
                    "delta": {"type": "number", "description": "Small positive or negative amount, e.g. 0.05"}
                },
                "required": ["metric", "delta"]
            }
        }),
        json!({
            "type": "function",
            "name": "confirm_flashcard_mastery",
            "description": "Confirms a flashcard from the 'pending re-check' list was answered correctly, unaided, in conversation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "flashcard_id": {"type": "string", "description": "The flashcard's id, exactly as listed"}
                },
                "required": ["flashcard_id"]
            }
        }),
    ]
}

/// Builds the tutor's system prompt from real, per-user data: the active
/// planet's sentences (so the session never drifts to content the learner
/// hasn't reached), a sample of mastered sentences from earlier planets for
/// cumulative review, and flashcards worth a surprise re-check.
async fn build_instructions(state: &AppState, user_id: Uuid) -> Result<String, AppError> {
    let planet = crate::planets::active_planet_for(&state.pool, user_id).await?;
    let sentences = crate::planets::tutor_sentences_for(&state.pool, user_id, planet.id).await?;
    let cumulative = crate::planets::cumulative_review_sample(&state.pool, user_id, planet.number, 8).await?;
    let review_cards = crate::flashcards::review_targets_for(&state.pool, user_id, 5).await?;

    let mut out = String::new();
    out.push_str(&format!("CURRENT PLANET: {} (Planet {})\n", planet.title, planet.number));
    out.push_str("Sentences for this planet (id — English — Portuguese — subject/verb/complement — status):\n");
    for s in &sentences {
        out.push_str(&format!(
            "- [{}] {} — {} — ({}/{}/{}) — {}\n",
            s.id,
            s.en,
            s.pt,
            s.subject,
            s.verb,
            s.complement,
            if s.mastered { "mastered, review only" } else { "not yet taught" }
        ));
    }

    if !cumulative.is_empty() {
        out.push_str("\nCUMULATIVE REVIEW — occasionally weave these earlier-planet sentences in unexpectedly:\n");
        for (en, pt) in &cumulative {
            out.push_str(&format!("- {en} — {pt}\n"));
        }
    }

    if !review_cards.is_empty() {
        out.push_str("\nFLASHCARDS PENDING RE-CHECK — surprise-quiz these if a natural moment comes up:\n");
        for (id, en, pt) in &review_cards {
            out.push_str(&format!("- [{id}] {en} — {pt}\n"));
        }
    }

    out.push('\n');
    out.push_str(CYCLE_PROMPT);
    Ok(out)
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
) -> Result<Json<Value>, AppError> {
    if state.openai_api_key.is_empty() {
        return Err(AppError::internal(
            "OPENAI_API_KEY is not configured on the server",
        ));
    }

    let instructions = build_instructions(&state, user_id).await?;
    let tools = tool_schemas();

    let body = SessionRequest {
        session: SessionConfig {
            ty: "realtime".into(),
            model: REALTIME_MODEL.into(),
            instructions: instructions.clone(),
            audio: SessionAudio {
                output: SessionAudioOutput {
                    voice: REALTIME_VOICE.into(),
                },
            },
            tools: tools.clone(),
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

    // Attach the canonical tutor instructions + tools so the app never has to
    // embed its own copy — the pedagogical method lives in one place, on the
    // server, built fresh from the learner's real progress every session.
    let mut json = json;
    if let Some(obj) = json.as_object_mut() {
        obj.insert("instructions".into(), Value::String(instructions));
        obj.insert("tools".into(), Value::Array(tools));
    }

    Ok(Json(json))
}
