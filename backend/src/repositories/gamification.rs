//! Gamification persistence (read-side stats; the activity "touch" is a
//! unit of work owned by [`crate::services::gamification`]).

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::UserStats;
use crate::schema::{badges, user_badges, user_stats};
use crate::services::gamification::Metrics;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use std::collections::HashMap;
use uuid::Uuid;

/// One achievement as the app sees it: its definition, the learner's current
/// value for the metric behind it, and when they earned it (if they have).
pub struct AchievementRow {
    pub code: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub tier: String,
    pub xp_reward: i32,
    pub threshold: i32,
    pub progress: i64,
    pub earned_at: Option<DateTime<Utc>>,
}

/// (id, code, title, description, icon, category, tier, xp_reward, metric,
/// threshold, scope) — the full definition, rule included, in one row. Title
/// and description are already the learner's language (see `localized`).
type BadgeDef = (
    Uuid,
    String,
    String,
    String,
    String,
    String,
    String,
    i32,
    String,
    i32,
    Option<i32>,
);

/// All three language variants of a badge's copy, in (en, pt, es) pairs.
type BadgeCopy = (String, String, String, String, String, String);

/// Picks the copy matching the learner's language. Every badge has all three
/// filled in (migration 2026-08-11-000011), so this is a total mapping — the
/// English arm is the default for a language the app doesn't ship yet.
fn localized(
    (title, description, title_pt, description_pt, title_es, description_es): BadgeCopy,
    language: &str,
) -> (String, String) {
    match language {
        "pt" => (title_pt, description_pt),
        "es" => (title_es, description_es),
        _ => (title, description),
    }
}

/// Everything `/gamification/stats` needs: the stats row, the learner's live
/// metric values, and all achievements with earned state and progress.
pub async fn stats(pool: &DbPool, user_id: Uuid) -> Result<(UserStats, Vec<AchievementRow>)> {
    run_db(pool, move |conn| {
        let s = user_stats::table
            .find(user_id)
            .first::<UserStats>(conn)
            .optional()?
            .unwrap_or_else(|| UserStats::empty(user_id));

        let metrics = crate::services::gamification::compute_metrics(conn, user_id, &s)?;

        let earned: HashMap<Uuid, DateTime<Utc>> = user_badges::table
            .filter(user_badges::user_id.eq(user_id))
            .select((user_badges::badge_id, user_badges::earned_at))
            .load::<(Uuid, DateTime<Utc>)>(conn)?
            .into_iter()
            .collect();

        // Achievement copy follows the learner's own language (the one the UI
        // is in), not the language being taught.
        let language: String = crate::schema::users::table
            .find(user_id)
            .select(crate::schema::users::base_language)
            .first(conn)
            .optional()?
            .unwrap_or_else(|| "en".into());

        let defs: Vec<(BadgeDef, BadgeCopy)> = badges::table
            .order((badges::sort_order.asc(), badges::code.asc()))
            .select((
                (
                    badges::id,
                    badges::code,
                    badges::title,
                    badges::description,
                    badges::icon,
                    badges::category,
                    badges::tier,
                    badges::xp_reward,
                    badges::metric,
                    badges::threshold,
                    badges::scope,
                ),
                (
                    badges::title,
                    badges::description,
                    badges::title_pt,
                    badges::description_pt,
                    badges::title_es,
                    badges::description_es,
                ),
            ))
            .load(conn)?;

        Ok((
            s,
            defs.into_iter()
                .map(|(def, copy)| {
                    let (title, description) = localized(copy, &language);
                    to_row(def, title, description, &metrics, &earned)
                })
                .collect(),
        ))
    })
    .await
}

fn to_row(
    (id, code, _en_title, _en_desc, icon, category, tier, xp_reward, metric, threshold, scope): BadgeDef,
    title: String,
    description: String,
    metrics: &Metrics,
    earned: &HashMap<Uuid, DateTime<Utc>>,
) -> AchievementRow {
    // Progress reads the same accessor the awarder uses, so the bar and the
    // award can never disagree. Capped at the threshold: "12/10" reads badly.
    let progress = metrics
        .value_of(&metric, scope)
        .unwrap_or(0)
        .min(i64::from(threshold));
    AchievementRow {
        code,
        title,
        description,
        icon,
        category,
        tier,
        xp_reward,
        threshold,
        progress,
        earned_at: earned.get(&id).copied(),
    }
}
