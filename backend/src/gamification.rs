use crate::auth::AuthUser;
use crate::db::run_db;
use crate::errors::AppError;
use crate::schema::{
    badges, card_reviews, conversations, corrections, flashcards, messages, planets,
    user_badges, user_planet_progress, user_stats,
};
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde::Serialize;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new().route("/stats", get(stats))
}

// ---------------------------------------------------------------------------

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = user_stats)]
struct UserStats {
    #[allow(dead_code)]
    user_id: Uuid,
    xp: i32,
    streak_days: i32,
    longest_streak: i32,
    last_active_date: Option<NaiveDate>,
    #[allow(dead_code)]
    updated_at: DateTime<Utc>,
}

impl UserStats {
    fn empty(user_id: Uuid) -> Self {
        Self { user_id, xp: 0, streak_days: 0, longest_streak: 0, last_active_date: None, updated_at: Utc::now() }
    }
}

/// Badge codes and the (already-loaded) counts they depend on, so we only
/// run one round of counting queries no matter how many badges exist.
struct BadgeCounts {
    corrections: i64,
    flashcards: i64,
    conversation_messages: i64,
    card_reviews: i64,
    planet_1_completed: bool,
}

fn earned_codes(counts: &BadgeCounts, streak_days: i32) -> Vec<&'static str> {
    let mut codes = Vec::new();
    if counts.corrections >= 1 {
        codes.push("first_correction");
    }
    if counts.flashcards >= 1 {
        codes.push("first_flashcard");
    }
    if counts.conversation_messages >= 1 {
        codes.push("first_conversation");
    }
    if streak_days >= 3 {
        codes.push("streak_3");
    }
    if streak_days >= 7 {
        codes.push("streak_7");
    }
    if counts.planet_1_completed {
        codes.push("planet_1_complete");
    }
    if counts.card_reviews >= 50 {
        codes.push("cards_50");
    }
    codes
}

/// Records that the user did something that counts as real progress: bumps
/// XP, advances the daily streak (once per calendar day), and awards any
/// newly-earned badges. Called from the handlers that represent genuine
/// learning events (corrections, mastered sentences, flashcard reviews,
/// progress bumps) — never client-triggered directly, so it can't be gamed.
///
/// Failures here are logged, not propagated: gamification bookkeeping should
/// never fail the primary action (recording a correction, etc.) it rides on.
pub(crate) async fn touch_activity_and_award_xp(pool: &crate::db::DbPool, user_id: Uuid, xp_delta: i32) {
    if let Err(e) = touch_activity_and_award_xp_inner(pool, user_id, xp_delta).await {
        tracing::warn!("gamification update failed for user {user_id}: {e:?}");
    }
}

async fn touch_activity_and_award_xp_inner(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    xp_delta: i32,
) -> Result<(), AppError> {
    let today = Utc::now().date_naive();

    run_db(pool, move |conn| {
        let current = user_stats::table
            .find(user_id)
            .first::<UserStats>(conn)
            .optional()?
            .unwrap_or_else(|| UserStats::empty(user_id));

        let streak_days = match current.last_active_date {
            Some(last) if last == today => current.streak_days.max(1),
            Some(last) if last == today.pred_opt().unwrap_or(today) => current.streak_days + 1,
            _ => 1,
        };
        let longest_streak = current.longest_streak.max(streak_days);
        let xp = current.xp + xp_delta;

        diesel::insert_into(user_stats::table)
            .values((
                user_stats::user_id.eq(user_id),
                user_stats::xp.eq(xp),
                user_stats::streak_days.eq(streak_days),
                user_stats::longest_streak.eq(longest_streak),
                user_stats::last_active_date.eq(today),
                user_stats::updated_at.eq(Utc::now()),
            ))
            .on_conflict(user_stats::user_id)
            .do_update()
            .set((
                user_stats::xp.eq(xp),
                user_stats::streak_days.eq(streak_days),
                user_stats::longest_streak.eq(longest_streak),
                user_stats::last_active_date.eq(today),
                user_stats::updated_at.eq(Utc::now()),
            ))
            .execute(conn)?;

        let counts = BadgeCounts {
            corrections: corrections::table.filter(corrections::user_id.eq(user_id)).count().get_result(conn)?,
            flashcards: flashcards::table.filter(flashcards::user_id.eq(user_id)).count().get_result(conn)?,
            conversation_messages: messages::table
                .inner_join(conversations::table.on(conversations::id.eq(messages::conversation_id)))
                .filter(conversations::user_id.eq(user_id))
                .count()
                .get_result(conn)?,
            card_reviews: card_reviews::table
                .inner_join(flashcards::table.on(flashcards::id.eq(card_reviews::flashcard_id)))
                .filter(flashcards::user_id.eq(user_id))
                .count()
                .get_result(conn)?,
            planet_1_completed: {
                let row: Option<(f64, f64)> = planets::table
                    .left_join(
                        user_planet_progress::table.on(user_planet_progress::planet_id
                            .eq(planets::id)
                            .and(user_planet_progress::user_id.eq(user_id))),
                    )
                    .filter(planets::number.eq(1))
                    .select((
                        diesel::dsl::sql::<diesel::sql_types::Double>("coalesce(user_planet_progress.mastery, 0)"),
                        planets::unlock_mastery,
                    ))
                    .first(conn)
                    .optional()?;
                row.is_some_and(|(mastery, unlock)| mastery >= unlock)
            },
        };

        let codes = earned_codes(&counts, streak_days);
        if !codes.is_empty() {
            let badge_ids: Vec<Uuid> = badges::table
                .filter(badges::code.eq_any(&codes))
                .select(badges::id)
                .load(conn)?;
            for badge_id in badge_ids {
                diesel::insert_into(user_badges::table)
                    .values((user_badges::user_id.eq(user_id), user_badges::badge_id.eq(badge_id)))
                    .on_conflict((user_badges::user_id, user_badges::badge_id))
                    .do_nothing()
                    .execute(conn)?;
            }
        }

        Ok(())
    })
    .await
}

// ---------------------------------------------------------------------------

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

async fn stats(State(state): State<AppState>, AuthUser(user_id): AuthUser) -> Result<Json<StatsJson>, AppError> {
    run_db(&state.pool, move |conn| {
        let s = user_stats::table
            .find(user_id)
            .first::<UserStats>(conn)
            .optional()?
            .unwrap_or_else(|| UserStats::empty(user_id));

        let badge_rows: Vec<(String, String, String, String, DateTime<Utc>)> = user_badges::table
            .inner_join(badges::table.on(badges::id.eq(user_badges::badge_id)))
            .filter(user_badges::user_id.eq(user_id))
            .order(user_badges::earned_at.desc())
            .select((badges::code, badges::title, badges::description, badges::icon, user_badges::earned_at))
            .load(conn)?;

        Ok(StatsJson {
            xp: s.xp,
            streak_days: s.streak_days,
            longest_streak: s.longest_streak,
            badges: badge_rows
                .into_iter()
                .map(|(code, title, description, icon, earned_at)| BadgeJson { code, title, description, icon, earned_at })
                .collect(),
        })
    })
    .await
    .map(Json)
}

#[cfg(test)]
mod tests {
    use super::{earned_codes, BadgeCounts};

    #[test]
    fn no_badges_when_nothing_happened() {
        let counts = BadgeCounts { corrections: 0, flashcards: 0, conversation_messages: 0, card_reviews: 0, planet_1_completed: false };
        assert!(earned_codes(&counts, 0).is_empty());
    }

    #[test]
    fn streak_badges_are_cumulative() {
        let counts = BadgeCounts { corrections: 0, flashcards: 0, conversation_messages: 0, card_reviews: 0, planet_1_completed: false };
        assert_eq!(earned_codes(&counts, 7), vec!["streak_3", "streak_7"]);
    }

    #[test]
    fn activity_badges_fire_at_threshold() {
        let counts = BadgeCounts { corrections: 1, flashcards: 1, conversation_messages: 1, card_reviews: 50, planet_1_completed: true };
        let codes = earned_codes(&counts, 0);
        assert!(codes.contains(&"first_correction"));
        assert!(codes.contains(&"first_flashcard"));
        assert!(codes.contains(&"first_conversation"));
        assert!(codes.contains(&"cards_50"));
        assert!(codes.contains(&"planet_1_complete"));
    }
}
