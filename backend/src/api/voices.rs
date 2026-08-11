//! Tutor voice catalog endpoint. The app renders its picker from this list
//! instead of a bundled copy, so relabeling a voice (or adding one OpenAI
//! ships) is a DB change, not an app release.

use crate::errors::Result;
use crate::middleware::auth::AuthUser;
use crate::models::TutorVoice;
use crate::repositories;
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list))
}

async fn list(
    State(state): State<AppState>,
    AuthUser(_user_id): AuthUser,
) -> Result<Json<Vec<TutorVoice>>> {
    Ok(Json(repositories::voices::list(&state.pool).await?))
}
