//! Gamification read endpoint (XP, streak, badges). Awarding happens
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

#[derive(Serialize)]
struct StatsJson {
    xp: i32,
    streak_days: i32,
    longest_streak: i32,
    badges: Vec<BadgeJson>,
}

async fn stats(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<StatsJson>> {
    let (s, badge_rows) = repositories::gamification::stats(&state.pool, user_id).await?;

    Ok(Json(StatsJson {
        xp: s.xp,
        streak_days: s.streak_days,
        longest_streak: s.longest_streak,
        badges: badge_rows
            .into_iter()
            .map(|(code, title, description, icon, earned_at)| BadgeJson {
                code,
                title,
                description,
                icon,
                earned_at,
            })
            .collect(),
    }))
}
