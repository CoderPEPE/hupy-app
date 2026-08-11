use crate::schema::users;
use chrono::{DateTime, Utc};
use diesel::{Insertable, Queryable, Selectable};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
/// Field order MUST match the `users` table column order (diesel maps
/// `Queryable` positionally): id, email, password_hash, created_at, language,
/// voice, base_language, name — `base_language` and `name` were appended by
/// migrations.
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    /// Which language is being taught (the target): 'en' | 'es' | 'pt'.
    pub language: String,
    /// Chosen tutor voice (OpenAI voice id); empty means "auto" — sessions
    /// fall back to the course's default voice.
    pub voice: String,
    /// The language used for explanations (the learner's own): 'en' | 'es' | 'pt'.
    pub base_language: String,
    /// The learner's real name (set at registration); empty means callers
    /// fall back to the email-derived name.
    pub name: String,
}

#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub base_language: String,
    pub language: String,
    pub voice: String,
    pub name: String,
}
