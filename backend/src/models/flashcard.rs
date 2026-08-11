use crate::schema::flashcards;
use chrono::{DateTime, Utc};
use diesel::{Insertable, Queryable, Selectable};
use uuid::Uuid;

/// A flashcard with its spaced-repetition scheduling state.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = flashcards)]
pub struct Card {
    pub id: Uuid,
    pub user_id: Uuid,
    pub planet_id: Option<Uuid>,
    pub correction_id: Option<Uuid>,
    pub en: String,
    pub pt: String,
    pub explanation: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub source: String,
    pub interval_days: i32,
    pub ease: f64,
    pub repetitions: i32,
    pub next_review_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    /// False when the card was rated "easy" but the tutor hasn't re-tested it
    /// live yet — a self-report alone never counts as mastered.
    pub verified_live: bool,
}

/// Insert payload for a new card; the scheduling columns are left to their
/// database defaults (interval 0, ease 2.5, repetitions 0, due now).
#[derive(Debug, Clone, Insertable)]
#[diesel(table_name = flashcards)]
pub struct NewCard {
    pub user_id: Uuid,
    pub planet_id: Option<Uuid>,
    pub correction_id: Option<Uuid>,
    pub en: String,
    pub pt: String,
    pub explanation: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub source: String,
}
