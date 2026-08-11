use crate::schema::user_stats;
use chrono::{DateTime, NaiveDate, Utc};
use diesel::{Queryable, Selectable};
use uuid::Uuid;

/// A user's gamification row (XP, streak, badges are derived on read).
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = user_stats)]
pub struct UserStats {
    #[allow(dead_code)] // the row is keyed by user_id; fetched for the other columns
    pub user_id: Uuid,
    pub xp: i32,
    pub streak_days: i32,
    pub longest_streak: i32,
    pub last_active_date: Option<NaiveDate>,
    #[allow(dead_code)]
    pub updated_at: DateTime<Utc>,
}

impl UserStats {
    pub fn empty(user_id: Uuid) -> Self {
        Self {
            user_id,
            xp: 0,
            streak_days: 0,
            longest_streak: 0,
            last_active_date: None,
            updated_at: Utc::now(),
        }
    }
}
