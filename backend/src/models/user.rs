use crate::schema::users;
use chrono::{DateTime, Utc};
use diesel::{Insertable, Queryable, Selectable};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    /// Which course this learner is on: 'en' | 'es' | 'pt'.
    pub language: String,
    /// Chosen tutor voice (OpenAI voice id); empty means "auto" — sessions
    /// fall back to the course's default voice.
    pub voice: String,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub language: String,
    pub voice: String,
}
