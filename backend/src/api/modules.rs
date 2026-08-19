//! Module progression endpoints — the gate between one module and the next.
//!
//! The tutor drives the first half: when the learner has produced every target
//! structure of the module correctly enough times, it calls `complete_module`,
//! which lands here. The second half is the module's flashcards, closed by
//! reviewing them (see `api::flashcards`).

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{lesson_id}/complete-conversation",
            post(complete_conversation),
        )
        .route("/{lesson_id}/production", post(record_production))
}

#[derive(Deserialize)]
pub struct RecordProduction {
    /// The structure's target-language sentence, exactly as authored under
    /// THIS MODULE — the one the learner just produced correctly.
    pub target: String,
}

#[derive(Deserialize, Default)]
pub struct CompleteConversation {
    /// Structures the learner kept getting wrong — replayed in later modules
    /// and in this planet's review module.
    #[serde(default)]
    pub weak_structures: Vec<String>,
}

#[derive(Serialize)]
pub struct ModuleStateJson {
    pub lesson_id: Uuid,
    pub state: String,
    pub conversation_done: bool,
    pub flashcards_done: bool,
    pub flashcards_total: i64,
    pub flashcards_reviewed: i64,
    /// The module that opens next, once this one is fully finished.
    pub next_lesson_id: Option<Uuid>,
}

/// Marks a module's conversation finished. Only the learner's *current*
/// module can be closed: the tutor is told which module it is teaching, and
/// accepting any id would let a stray tool call skip the curriculum.
async fn complete_conversation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(lesson_id): Path<Uuid>,
    body: Bytes,
) -> Result<Json<ModuleStateJson>> {
    // The weak-structure list is optional: a tutor that closes a module with
    // nothing to flag sends an empty body, and that must not be a 400 on the
    // one call that moves the learner forward.
    let body: CompleteConversation = if body.is_empty() {
        CompleteConversation::default()
    } else {
        serde_json::from_slice(&body)
            .map_err(|e| AppError::bad_request(format!("invalid body: {e}")))?
    };
    let module = repositories::modules::lesson(&state.pool, lesson_id)
        .await?
        .ok_or_else(|| AppError::not_found("module not found"))?;

    let modules = repositories::modules::lessons_for(&state.pool, module.planet_id).await?;
    let progress =
        repositories::modules::progress_for_planet(&state.pool, user_id, module.planet_id).await?;
    let current = services::curriculum::current_module(&modules, &progress);
    if current.map(|m| m.id) != Some(lesson_id) {
        return Err(AppError::conflict(
            "this is not the module currently being studied",
        ));
    }

    let weak = serde_json::json!(body
        .weak_structures
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>());
    repositories::modules::complete_conversation(&state.pool, user_id, lesson_id, weak).await?;

    // A module whose conversation produced no flashcards has nothing to
    // review — close that half too rather than stranding the learner behind
    // an empty deck.
    let (total, reviewed) =
        repositories::modules::flashcard_counts(&state.pool, user_id, lesson_id).await?;
    let flashcards_done = total == 0 || reviewed >= total;
    if flashcards_done {
        repositories::modules::set_flashcards_done(&state.pool, user_id, lesson_id, true).await?;
    }

    let progress =
        repositories::modules::progress_for_planet(&state.pool, user_id, module.planet_id).await?;
    let states = services::curriculum::module_states(&modules, &progress);
    let index = modules.iter().position(|m| m.id == lesson_id).unwrap_or(0);

    Ok(Json(ModuleStateJson {
        lesson_id,
        state: states[index].as_str().to_string(),
        conversation_done: true,
        flashcards_done,
        flashcards_total: total,
        flashcards_reviewed: reviewed,
        next_lesson_id: states[index]
            .is_completed()
            .then(|| modules.get(index + 1).map(|m| m.id))
            .flatten(),
    }))
}

/// Logs one correct production of the current module's structure — the
/// deterministic driver of module completion (see the CYCLE_PROMPT's
/// `record_production` tool). The tutor calls it each time the learner
/// produces the structure right; the count persists as the checkpoint; and
/// once every structure reaches the required productions, the conversation
/// half of the gate closes here, automatically, without trusting the model
/// to remember `complete_module`.
async fn record_production(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(lesson_id): Path<Uuid>,
    Json(body): Json<RecordProduction>,
) -> Result<Json<Value>> {
    let module = repositories::modules::lesson(&state.pool, lesson_id)
        .await?
        .ok_or_else(|| AppError::not_found("module not found"))?;

    // Only the learner's *current* module may take productions — the tutor
    // is told exactly which module it is teaching, and accepting any id
    // would let a stray tool call (or a model that drifted) farm progress on
    // modules that are locked.
    let modules = repositories::modules::lessons_for(&state.pool, module.planet_id).await?;
    let progress =
        repositories::modules::progress_for_planet(&state.pool, user_id, module.planet_id).await?;
    let current = services::curriculum::current_module(&modules, &progress);
    if current.map(|m| m.id) != Some(lesson_id) {
        return Err(AppError::conflict(
            "this is not the module currently being studied",
        ));
    }

    let structures = services::curriculum::structures(&module.structures);
    let key = body.target.trim().to_string();
    if !structures.iter().any(|s| s.target == key) {
        return Err(AppError::bad_request(
            "structure is not part of this module",
        ));
    }

    let total = structures.len() as i64;
    let outcome = repositories::modules::record_production(
        &state.pool,
        user_id,
        lesson_id,
        &key,
        total,
        services::curriculum::REQUIRED_PRODUCTIONS as i32,
    )
    .await?;

    // The per-structure state that powers the app's progress bar, rebuilt
    // from the same rows the next session's prompt will read — one source of
    // truth for what the learner has done.
    let counts = repositories::modules::structure_progress(&state.pool, user_id, lesson_id).await?;
    let structures_json: Vec<Value> = structures
        .into_iter()
        .map(|s| {
            let p = counts.get(&s.target).copied().unwrap_or(0);
            json!({
                "target": s.target,
                "base": s.base,
                "productions": p,
                "done": p >= services::curriculum::REQUIRED_PRODUCTIONS as i32,
            })
        })
        .collect();

    Ok(Json(json!({
        "lesson_id": lesson_id,
        "target": key,
        "productions": outcome.productions,
        "done_count": outcome.done_count,
        "total_count": outcome.total_count,
        "all_structures_done": outcome.done_count >= outcome.total_count,
        "conversation_done": outcome.conversation_done,
        "flashcards_done": outcome.flashcards_done,
        "structures": structures_json,
    })))
}
