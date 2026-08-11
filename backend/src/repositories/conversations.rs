//! Conversation persistence (chat history + corrections).

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{Conversation, Correction, Message, NewCorrection, NewMessage};
use crate::schema::{conversations, corrections, messages};
use chrono::Utc;
use diesel::prelude::*;
use diesel::OptionalExtension;
use uuid::Uuid;

/// Loads a conversation owned by the user, or 404.
pub async fn find_owned(
    pool: &DbPool,
    user_id: Uuid,
    conversation_id: Uuid,
) -> Result<Conversation> {
    run_db(pool, move |conn| {
        let conv = conversations::table
            .find(conversation_id)
            .first::<Conversation>(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("conversation not found"))?;
        if conv.user_id != user_id {
            return Err(AppError::not_found("conversation not found"));
        }
        Ok(conv)
    })
    .await
}

/// All of a user's conversations (newest activity first) with message counts,
/// in one query pass.
pub async fn list_with_message_counts(
    pool: &DbPool,
    user_id: Uuid,
) -> Result<Vec<(Conversation, i64)>> {
    run_db(pool, move |conn| {
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
            .map(|c| {
                let count = count_map.get(&c.id).copied().unwrap_or(0);
                (c, count)
            })
            .collect())
    })
    .await
}

pub async fn create(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Option<Uuid>,
    title: &str,
) -> Result<Conversation> {
    let title = title.to_string();
    run_db(pool, move |conn| {
        Ok(diesel::insert_into(conversations::table)
            .values((
                conversations::user_id.eq(user_id),
                conversations::planet_id.eq(planet_id),
                conversations::title.eq(title),
            ))
            .returning(Conversation::as_returning())
            .get_result::<Conversation>(conn)?)
    })
    .await
}

pub async fn messages_for(pool: &DbPool, conversation_id: Uuid) -> Result<Vec<Message>> {
    run_db(pool, move |conn| {
        Ok(messages::table
            .filter(messages::conversation_id.eq(conversation_id))
            .order(messages::created_at.asc())
            .load::<Message>(conn)?)
    })
    .await
}

pub async fn corrections_for(pool: &DbPool, conversation_id: Uuid) -> Result<Vec<Correction>> {
    run_db(pool, move |conn| {
        Ok(corrections::table
            .filter(corrections::conversation_id.eq(conversation_id))
            .order(corrections::created_at.asc())
            .load::<Correction>(conn)?)
    })
    .await
}

/// Appends a message and bumps the conversation's `updated_at`.
pub async fn insert_message(pool: &DbPool, m: &NewMessage) -> Result<Message> {
    let m = m.clone();
    run_db(pool, move |conn| {
        let msg = diesel::insert_into(messages::table)
            .values(&m)
            .returning(Message::as_returning())
            .get_result::<Message>(conn)?;
        touch(conn, m.conversation_id)?;
        Ok(msg)
    })
    .await
}

/// Appends a correction and bumps the conversation's `updated_at`.
pub async fn insert_correction(pool: &DbPool, c: &NewCorrection) -> Result<Correction> {
    let c = c.clone();
    run_db(pool, move |conn| {
        let corr = diesel::insert_into(corrections::table)
            .values(&c)
            .returning(Correction::as_returning())
            .get_result::<Correction>(conn)?;
        if let Some(conversation_id) = c.conversation_id {
            touch(conn, conversation_id)?;
        }
        Ok(corr)
    })
    .await
}

pub async fn delete(pool: &DbPool, conversation_id: Uuid) -> Result<()> {
    run_db(pool, move |conn| {
        diesel::delete(conversations::table.find(conversation_id)).execute(conn)?;
        Ok(())
    })
    .await
}

fn touch(conn: &mut diesel::pg::PgConnection, id: Uuid) -> Result<()> {
    diesel::update(conversations::table.find(id))
        .set(conversations::updated_at.eq(Utc::now()))
        .execute(conn)?;
    Ok(())
}
