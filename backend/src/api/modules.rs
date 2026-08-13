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
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/{lesson_id}/complete-conversation",
        post(complete_conversation),
    )
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
