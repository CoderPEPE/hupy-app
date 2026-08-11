//! Conversation endpoints (live chat history + corrections).

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::models::{Conversation, Correction, Message, NewCorrection, NewMessage};
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_conversations).post(create_conversation))
        .route(
            "/{id}",
            get(conversation_detail).delete(delete_conversation),
        )
        .route("/{id}/messages", axum::routing::post(add_message))
        .route("/{id}/corrections", axum::routing::post(add_correction))
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ConversationSummary {
    pub id: Uuid,
    pub title: String,
    pub planet_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: i64,
}

#[derive(Serialize)]
pub struct ConversationDetail {
    pub id: Uuid,
    pub title: String,
    pub planet_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub messages: Vec<Message>,
    pub corrections: Vec<Correction>,
}

#[derive(Deserialize)]
pub struct CreateConversation {
    pub title: Option<String>,
    pub planet_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct CreateMessage {
    pub role: String,
    pub text: String,
    pub kind: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateCorrection {
    pub said: String,
    pub corrected: String,
    pub explanation: String,
    pub pt: Option<String>,
    pub mistake_part: Option<String>,
    pub subject: Option<String>,
    pub verb: Option<String>,
    pub complement: Option<String>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_conversations(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<ConversationSummary>>> {
    let out = repositories::conversations::list_with_message_counts(&state.pool, user_id)
        .await?
        .into_iter()
        .map(|(c, message_count)| ConversationSummary {
            id: c.id,
            title: c.title,
            planet_id: c.planet_id,
            created_at: c.created_at,
            updated_at: c.updated_at,
            message_count,
        })
        .collect::<Vec<_>>();

    Ok(Json(out))
}

async fn create_conversation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateConversation>,
) -> Result<(StatusCode, Json<ConversationSummary>)> {
    if let Some(t) = &body.title {
        if t.len() > 255 {
            return Err(AppError::bad_request("title too long (max 255 chars)"));
        }
    }

    // Auto-title from the planet when no explicit title is given.
    let title = match (&body.title, body.planet_id) {
        (Some(t), _) if !t.trim().is_empty() => t.trim().to_string(),
        (_, Some(pid)) => {
            match repositories::planets::planet_number_and_title(&state.pool, pid).await? {
                Some((number, title)) => format!("Live conversation · Planet {number} — {title}"),
                None => "Live conversation".into(),
            }
        }
        _ => "Live conversation".into(),
    };

    let conv =
        repositories::conversations::create(&state.pool, user_id, body.planet_id, &title).await?;

    Ok((
        StatusCode::CREATED,
        Json(ConversationSummary {
            id: conv.id,
            title: conv.title,
            planet_id: conv.planet_id,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            message_count: 0,
        }),
    ))
}

async fn conversation_detail(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ConversationDetail>> {
    let conv: Conversation =
        repositories::conversations::find_owned(&state.pool, user_id, id).await?;
    let messages = repositories::conversations::messages_for(&state.pool, id).await?;
    let corrections = repositories::conversations::corrections_for(&state.pool, id).await?;

    Ok(Json(ConversationDetail {
        id: conv.id,
        title: conv.title,
        planet_id: conv.planet_id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        messages,
        corrections,
    }))
}

async fn add_message(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateMessage>,
) -> Result<(StatusCode, Json<Message>)> {
    if !matches!(body.role.as_str(), "user" | "assistant") {
        return Err(AppError::bad_request("role must be 'user' or 'assistant'"));
    }
    if body.text.trim().is_empty() {
        return Err(AppError::bad_request("message text cannot be empty"));
    }
    if body.text.len() > 4000 {
        return Err(AppError::bad_request(
            "message text too long (max 4000 chars)",
        ));
    }
    repositories::conversations::find_owned(&state.pool, user_id, id).await?;

    let msg = repositories::conversations::insert_message(
        &state.pool,
        &NewMessage {
            conversation_id: id,
            role: body.role,
            kind: body.kind.unwrap_or_default(),
            text: body.text,
        },
    )
    .await?;

    Ok((StatusCode::CREATED, Json(msg)))
}

async fn add_correction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateCorrection>,
) -> Result<(StatusCode, Json<Correction>)> {
    if body.said.trim().is_empty() || body.corrected.trim().is_empty() {
        return Err(AppError::bad_request("said and corrected cannot be empty"));
    }
    if body.said.len() > 2000 || body.corrected.len() > 2000 {
        return Err(AppError::bad_request(
            "said and corrected too long (max 2000 chars each)",
        ));
    }
    if body.explanation.len() > 4000 {
        return Err(AppError::bad_request(
            "explanation too long (max 4000 chars)",
        ));
    }
    // Optional fields map to VARCHAR columns — cap them so oversized input
    // returns a clean 400 instead of a database error.
    for (name, value, max) in [
        ("pt", body.pt.as_deref().unwrap_or(""), 512usize),
        (
            "mistake_part",
            body.mistake_part.as_deref().unwrap_or(""),
            255,
        ),
        ("subject", body.subject.as_deref().unwrap_or(""), 128),
        ("verb", body.verb.as_deref().unwrap_or(""), 128),
        ("complement", body.complement.as_deref().unwrap_or(""), 512),
    ] {
        if value.len() > max {
            return Err(AppError::bad_request(format!(
                "{name} too long (max {max} chars)"
            )));
        }
    }
    repositories::conversations::find_owned(&state.pool, user_id, id).await?;

    let corr = repositories::conversations::insert_correction(
        &state.pool,
        &NewCorrection {
            user_id,
            conversation_id: Some(id),
            said: body.said,
            corrected: body.corrected,
            explanation: body.explanation,
            pt: body.pt.unwrap_or_default(),
            mistake_part: body.mistake_part.unwrap_or_default(),
            subject: body.subject.unwrap_or_default(),
            verb: body.verb.unwrap_or_default(),
            complement: body.complement.unwrap_or_default(),
        },
    )
    .await?;

    services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 3).await;

    Ok((StatusCode::CREATED, Json(corr)))
}

async fn delete_conversation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    repositories::conversations::find_owned(&state.pool, user_id, id).await?;
    repositories::conversations::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}
