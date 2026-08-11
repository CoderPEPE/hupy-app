//! Gamification persistence (read-side stats; the activity "touch" is a
//! unit of work owned by [`crate::services::gamification`]).

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::UserStats;
use crate::schema::{badges, user_badges, user_stats};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use uuid::Uuid;

/// The user's stats row plus their earned badges, joined — everything the
/// `/gamification/stats` endpoint needs, in one query pass.
pub async fn stats(
    pool: &DbPool,
    user_id: Uuid,
) -> Result<(
    UserStats,
    Vec<(String, String, String, String, DateTime<Utc>)>,
)> {
    run_db(pool, move |conn| {
        let s = user_stats::table
            .find(user_id)
            .first::<UserStats>(conn)
            .optional()?
            .unwrap_or_else(|| UserStats::empty(user_id));

        let badge_rows: Vec<(String, String, String, String, DateTime<Utc>)> = user_badges::table
            .inner_join(badges::table.on(badges::id.eq(user_badges::badge_id)))
            .filter(user_badges::user_id.eq(user_id))
            .order(user_badges::earned_at.desc())
            .select((
                badges::code,
                badges::title,
                badges::description,
                badges::icon,
                user_badges::earned_at,
            ))
            .load(conn)?;

        Ok((s, badge_rows))
    })
    .await
}
