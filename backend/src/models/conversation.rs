use crate::schema::{conversations, corrections, messages};
use chrono::{DateTime, Utc};
use diesel::{Insertable, Queryable, Selectable};
use serde::Serialize;
use uuid::Uuid;

/// A conversation (live chat history) owned by a user.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = conversations)]
pub struct Conversation {
    pub id: Uuid,
    pub user_id: Uuid,
    pub planet_id: Option<Uuid>,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = messages)]
pub struct NewMessage {
    pub conversation_id: Uuid,
    pub role: String,
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = corrections)]
pub struct NewCorrection {
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
}
