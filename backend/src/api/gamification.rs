//! Gamification read endpoint (XP, streak, achievements). Awarding happens
//! server-side inside the learning-event handlers via the gamification
//! service — there is deliberately no client-triggered XP endpoint.

use crate::errors::Result;
use crate::middleware::auth::AuthUser;
use crate::repositories;
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;

pub fn router() -> Router<AppState> {
    Router::new().route("/stats", get(stats))
}

#[derive(Serialize)]
struct BadgeJson {
    code: String,
    title: String,
    description: String,
    icon: String,
    earned_at: DateTime<Utc>,
}

/// An achievement plus the learner's standing on it. `earned_at` is null while
/// it is still locked, and `progress`/`threshold` drive the progress bar.
#[derive(Serialize)]
struct AchievementJson {
    code: String,
    title: String,
    description: String,
    icon: String,
    category: String,
    tier: String,
    xp_reward: i32,
    progress: i64,
    threshold: i32,
    earned_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
struct StatsJson {
    xp: i32,
    streak_days: i32,
    longest_streak: i32,
    /// Earned achievements, newest first — the original field, unchanged, so
    /// older app builds keep working.
    badges: Vec<BadgeJson>,
    /// Every achievement, locked ones included, in display order.
    achievements: Vec<AchievementJson>,
    earned_count: usize,
    total_count: usize,
}

async fn stats(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<StatsJson>> {
    let (s, rows) = repositories::gamification::stats(&state.pool, user_id).await?;

    let mut badges: Vec<BadgeJson> = rows
        .iter()
        .filter_map(|a| {
            a.earned_at.map(|earned_at| BadgeJson {
                code: a.code.clone(),
                title: a.title.clone(),
                description: a.description.clone(),
                icon: a.icon.clone(),
                earned_at,
            })
        })
        .collect();
    badges.sort_by_key(|b| std::cmp::Reverse(b.earned_at));

    let earned_count = badges.len();
    let total_count = rows.len();

    Ok(Json(StatsJson {
        xp: s.xp,
        streak_days: s.streak_days,
        longest_streak: s.longest_streak,
        badges,
        earned_count,
        total_count,
        achievements: rows
            .into_iter()
            .map(|a| AchievementJson {
                code: a.code,
                title: a.title,
                description: a.description,
                icon: a.icon,
                category: a.category,
                tier: a.tier,
                xp_reward: a.xp_reward,
                progress: a.progress,
                threshold: a.threshold,
                earned_at: a.earned_at,
            })
            .collect(),
    }))
}
