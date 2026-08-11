use crate::auth::AuthUser;
use crate::db::run_db;
use crate::errors::AppError;
use crate::schema::{conversations, corrections, messages, planets};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
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

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = conversations)]
struct Conversation {
    id: Uuid,
    user_id: Uuid,
    planet_id: Option<Uuid>,
    title: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Queryable, Selectable, Serialize)]
#[diesel(table_name = messages)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub role: String,
    pub kind: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Queryable, Selectable, Serialize)]
#[diesel(table_name = corrections)]
pub struct Correction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub conversation_id: Option<Uuid>,
    pub said: String,
    pub corrected: String,
    pub explanation: String,
    pub pt: String,
    pub mistake_part: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub created_at: DateTime<Utc>,
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

/// Loads a conversation owned by the user, or 404.
async fn load_owned_conversation(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    conversation_id: Uuid,
) -> Result<Conversation, AppError> {
    run_db(pool, move |conn| {
        let conv = conversations::table
            .find(conversation_id)
            .first::<Conversation>(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("conversation not found".into()))?;
        if conv.user_id != user_id {
            return Err(AppError::NotFound("conversation not found".into()));
        }
        Ok(conv)
    })
    .await
}

fn touch(conn: &mut diesel::pg::PgConnection, id: Uuid) -> Result<(), AppError> {
    diesel::update(conversations::table.find(id))
        .set(conversations::updated_at.eq(Utc::now()))
        .execute(conn)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_conversations(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<ConversationSummary>>, AppError> {
    let out = run_db(&state.pool, move |conn| {
        let convs: Vec<Conversation> = conversations::table
            .filter(conversations::user_id.eq(user_id))
            .order(conversations::updated_at.desc())
            .load(conn)?;

        let ids: Vec<Uuid> = convs.iter().map(|c| c.id).collect();
        let counts: Vec<(Uuid, i64)> = messages::table
            .filter(messages::conversation_id.eq_any(&ids))
            .group_by(messages::conversation_id)
            .select((messages::conversation_id, diesel::dsl::count(messages::id)))
            .load(conn)?;
        let count_map: std::collections::HashMap<Uuid, i64> = counts.into_iter().collect();

        Ok(convs
            .into_iter()
            .map(|c| ConversationSummary {
                id: c.id,
                title: c.title,
                planet_id: c.planet_id,
                created_at: c.created_at,
                updated_at: c.updated_at,
                message_count: count_map.get(&c.id).copied().unwrap_or(0),
            })
            .collect::<Vec<_>>())
    })
    .await?;

    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct CreateConversation {
    pub title: Option<String>,
    pub planet_id: Option<Uuid>,
}

async fn create_conversation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateConversation>,
) -> Result<(axum::http::StatusCode, Json<ConversationSummary>), AppError> {
    if let Some(t) = &body.title {
        if t.len() > 255 {
            return Err(AppError::bad_request("title too long (max 255 chars)"));
        }
    }

    let conv = run_db(&state.pool, move |conn| {
        let title = match (&body.title, body.planet_id) {
            (Some(t), _) if !t.trim().is_empty() => t.trim().to_string(),
            (_, Some(pid)) => {
                let planet = planets::table
                    .find(pid)
                    .select((planets::number, planets::title))
                    .first::<(i32, String)>(conn)
                    .optional()?;
                match planet {
                    Some((number, title)) => format!("Live conversation · Planet {number} — {title}"),
                    None => "Live conversation".into(),
                }
            }
            _ => "Live conversation".into(),
        };

        let conv = diesel::insert_into(conversations::table)
            .values((
                conversations::user_id.eq(user_id),
                conversations::planet_id.eq(body.planet_id),
                conversations::title.eq(title),
            ))
            .returning(Conversation::as_returning())
            .get_result::<Conversation>(conn)?;

        Ok(ConversationSummary {
            id: conv.id,
            title: conv.title,
            planet_id: conv.planet_id,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            message_count: 0,
        })
    })
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(conv)))
}

async fn conversation_detail(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ConversationDetail>, AppError> {
    let conv = load_owned_conversation(&state.pool, user_id, id).await?;
    let out = run_db(&state.pool, move |conn| {
        let msgs = messages::table
            .filter(messages::conversation_id.eq(id))
            .order(messages::created_at.asc())
            .load::<Message>(conn)?;
        let corrs = corrections::table
            .filter(corrections::conversation_id.eq(id))
            .order(corrections::created_at.asc())
            .load::<Correction>(conn)?;
        Ok(ConversationDetail {
            id: conv.id,
            title: conv.title,
            planet_id: conv.planet_id,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            messages: msgs,
            corrections: corrs,
        })
    })
    .await?;

    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct CreateMessage {
    pub role: String,
    pub text: String,
    pub kind: Option<String>,
}

async fn add_message(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateMessage>,
) -> Result<(axum::http::StatusCode, Json<Message>), AppError> {
    if !matches!(body.role.as_str(), "user" | "assistant") {
        return Err(AppError::bad_request("role must be 'user' or 'assistant'"));
    }
    if body.text.trim().is_empty() {
        return Err(AppError::bad_request("message text cannot be empty"));
    }
    if body.text.len() > 4000 {
        return Err(AppError::bad_request("message text too long (max 4000 chars)"));
    }
    load_owned_conversation(&state.pool, user_id, id).await?;

    let msg = run_db(&state.pool, move |conn| {
        let m = diesel::insert_into(messages::table)
            .values((
                messages::conversation_id.eq(id),
                messages::role.eq(body.role),
                messages::kind.eq(body.kind.unwrap_or_default()),
                messages::text.eq(body.text),
            ))
            .returning(Message::as_returning())
            .get_result::<Message>(conn)?;
        touch(conn, id)?;
        Ok(m)
    })
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(msg)))
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

async fn add_correction(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateCorrection>,
) -> Result<(axum::http::StatusCode, Json<Correction>), AppError> {
    if body.said.trim().is_empty() || body.corrected.trim().is_empty() {
        return Err(AppError::bad_request("said and corrected cannot be empty"));
    }
    if body.said.len() > 2000 || body.corrected.len() > 2000 {
        return Err(AppError::bad_request("said and corrected too long (max 2000 chars each)"));
    }
    if body.explanation.len() > 4000 {
        return Err(AppError::bad_request("explanation too long (max 4000 chars)"));
    }
    // Optional fields map to VARCHAR columns — cap them so oversized input
    // returns a clean 400 instead of a database error.
    for (name, value, max) in [
        ("pt", body.pt.as_deref().unwrap_or(""), 512usize),
        ("mistake_part", body.mistake_part.as_deref().unwrap_or(""), 255),
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
    load_owned_conversation(&state.pool, user_id, id).await?;

    let corr = run_db(&state.pool, move |conn| {
        let c = diesel::insert_into(corrections::table)
            .values((
                corrections::user_id.eq(user_id),
                corrections::conversation_id.eq(id),
                corrections::said.eq(body.said),
                corrections::corrected.eq(body.corrected),
                corrections::explanation.eq(body.explanation),
                corrections::pt.eq(body.pt.unwrap_or_default()),
                corrections::mistake_part.eq(body.mistake_part.unwrap_or_default()),
                corrections::subject.eq(body.subject.unwrap_or_default()),
                corrections::verb.eq(body.verb.unwrap_or_default()),
                corrections::complement.eq(body.complement.unwrap_or_default()),
            ))
            .returning(Correction::as_returning())
            .get_result::<Correction>(conn)?;
        touch(conn, id)?;
        Ok(c)
    })
    .await?;

    crate::gamification::touch_activity_and_award_xp(&state.pool, user_id, 3).await;

    Ok((axum::http::StatusCode::CREATED, Json(corr)))
}

async fn delete_conversation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    load_owned_conversation(&state.pool, user_id, id).await?;
    run_db(&state.pool, move |conn| {
        diesel::delete(conversations::table.find(id)).execute(conn)?;
        Ok(())
    })
    .await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
