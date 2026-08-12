//! Gamification rules: XP, daily streaks and achievement awarding.
//!
//! Achievements are **data, not code**: every row in `badges` carries the rule
//! that earns it (a `metric`, a `threshold`, and an optional planet `scope`).
//! This module computes each metric once per user and awards everything that
//! qualifies, so a new achievement is an INSERT — see
//! `migrations/2026-08-11-000010_achievements`.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::UserStats;
use crate::schema::{
    badges, card_reviews, conversations, corrections, flashcards, messages, planets, user_badges,
    user_planet_progress, user_sentence_progress, user_stats,
};
use chrono::Utc;
use diesel::prelude::*;
use diesel::Connection;
use diesel::OptionalExtension;
use std::collections::HashMap;
use uuid::Uuid;

/// Every counter an achievement rule can be written against. Computed in one
/// pass so the cost does not grow with the number of achievements.
#[derive(Debug, Default, Clone)]
pub struct Metrics {
    pub corrections: i64,
    pub flashcards: i64,
    pub card_reviews: i64,
    pub cards_verified: i64,
    pub conversations: i64,
    pub messages: i64,
    pub sentences_mastered: i64,
    pub lessons_completed: i64,
    pub planets_completed: i64,
    /// Planet number -> lessons finished on it (0..=4).
    pub planet_lessons: HashMap<i32, i64>,
    pub streak_days: i64,
    pub longest_streak: i64,
    pub xp: i64,
}

impl Metrics {
    /// The user's current value for a rule's metric, or None when the metric
    /// name isn't one we know (a typo in a seed row shouldn't award anything).
    pub fn value_of(&self, metric: &str, scope: Option<i32>) -> Option<i64> {
        Some(match metric {
            "corrections" => self.corrections,
            "flashcards" => self.flashcards,
            "card_reviews" => self.card_reviews,
            "cards_verified" => self.cards_verified,
            "conversations" => self.conversations,
            "messages" => self.messages,
            "sentences_mastered" => self.sentences_mastered,
            "lessons_completed" => self.lessons_completed,
            "planets_completed" => self.planets_completed,
            "planet_lessons" => *self.planet_lessons.get(&scope?).unwrap_or(&0),
            "streak_days" => self.streak_days,
            "longest_streak" => self.longest_streak,
            "xp" => self.xp,
            _ => return None,
        })
    }
}

/// A badge's rule, as stored.
pub struct Rule {
    pub id: Uuid,
    pub metric: String,
    pub threshold: i32,
    pub scope: Option<i32>,
    pub xp_reward: i32,
}

/// Counts everything the achievement rules can reference. `stats` is passed in
/// because the caller has usually just written it in the same transaction.
pub fn compute_metrics(
    conn: &mut PgConnection,
    user_id: Uuid,
    stats: &UserStats,
) -> QueryResult<Metrics> {
    // Lessons are derived, not stored: a planet's four lessons (learn ->
    // practice -> test -> master) each unlock at a mastery threshold, so
    // "lessons completed" is a function of per-planet mastery.
    let masteries: Vec<(i32, f64)> = user_planet_progress::table
        .inner_join(planets::table.on(planets::id.eq(user_planet_progress::planet_id)))
        .filter(user_planet_progress::user_id.eq(user_id))
        .select((planets::number, user_planet_progress::mastery))
        .load(conn)?;

    let mut planet_lessons: HashMap<i32, i64> = HashMap::new();
    for (number, mastery) in &masteries {
        let done = crate::services::planets::lessons_completed_count(*mastery);
        // A learner has one course, but the same planet number exists once per
        // course; keep the best row so switching courses never regresses.
        let entry = planet_lessons.entry(*number).or_insert(0);
        *entry = (*entry).max(done);
    }
    let lessons_completed = planet_lessons.values().sum();

    // "Conquered" here must mean exactly what the Planets tab means by it
    // (spec §5): past the mastery bar *and* no essential skill below the
    // floor — otherwise a planet badge could fire for a planet still showing
    // a pending review. The rounding tolerance mirrors
    // `services::planets::at_least`.
    let eps = 1e-9;
    let floor = crate::services::planets::MIN_ESSENTIAL_SKILL - eps;
    let planets_completed: i64 = planets::table
        .inner_join(
            user_planet_progress::table.on(user_planet_progress::planet_id
                .eq(planets::id)
                .and(user_planet_progress::user_id.eq(user_id))),
        )
        .filter(user_planet_progress::mastery.ge(planets::unlock_mastery - eps))
        .filter(user_planet_progress::sentences.ge(floor))
        .filter(user_planet_progress::listening.ge(floor))
        .filter(user_planet_progress::pronunciation.ge(floor))
        .filter(user_planet_progress::conversation.ge(floor))
        .select(planets::number)
        .distinct()
        .count()
        .get_result(conn)?;

    Ok(Metrics {
        corrections: corrections::table
            .filter(corrections::user_id.eq(user_id))
            .count()
            .get_result(conn)?,
        flashcards: flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .count()
            .get_result(conn)?,
        card_reviews: card_reviews::table
            .inner_join(flashcards::table.on(flashcards::id.eq(card_reviews::flashcard_id)))
            .filter(flashcards::user_id.eq(user_id))
            .count()
            .get_result(conn)?,
        cards_verified: flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::verified_live.eq(true))
            .count()
            .get_result(conn)?,
        conversations: conversations::table
            .filter(conversations::user_id.eq(user_id))
            .count()
            .get_result(conn)?,
        messages: messages::table
            .inner_join(conversations::table.on(conversations::id.eq(messages::conversation_id)))
            .filter(conversations::user_id.eq(user_id))
            .count()
            .get_result(conn)?,
        sentences_mastered: user_sentence_progress::table
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?,
        lessons_completed,
        planets_completed,
        planet_lessons,
        streak_days: i64::from(stats.streak_days),
        longest_streak: i64::from(stats.longest_streak),
        xp: i64::from(stats.xp),
    })
}

/// Loads every achievement rule (100 rows — one query, no per-badge lookups).
pub fn load_rules(conn: &mut PgConnection) -> QueryResult<Vec<Rule>> {
    badges::table
        .select((
            badges::id,
            badges::metric,
            badges::threshold,
            badges::scope,
            badges::xp_reward,
        ))
        .load::<(Uuid, String, i32, Option<i32>, i32)>(conn)
        .map(|rows| {
            rows.into_iter()
                .map(|(id, metric, threshold, scope, xp_reward)| Rule {
                    id,
                    metric,
                    threshold,
                    scope,
                    xp_reward,
                })
                .collect()
        })
}

/// The rules a set of metrics satisfies.
pub fn earned_rules<'a>(rules: &'a [Rule], m: &Metrics) -> Vec<&'a Rule> {
    rules
        .iter()
        .filter(|r| {
            m.value_of(&r.metric, r.scope)
                .is_some_and(|v| v >= i64::from(r.threshold))
        })
        .collect()
}

/// Records that the user did something that counts as real progress: bumps
/// XP, advances the daily streak (once per calendar day), and awards any
/// newly-earned achievements (plus their XP rewards).
///
/// Failures here are logged, not propagated: gamification bookkeeping should
/// never fail the primary action (recording a correction, etc.) it rides on.
pub async fn touch_activity_and_award_xp(pool: &DbPool, user_id: Uuid, xp_delta: i32) {
    if let Err(e) = touch_activity_and_award_xp_inner(pool, user_id, xp_delta).await {
        tracing::warn!("gamification update failed for user {user_id}: {e:?}");
    }
}

async fn touch_activity_and_award_xp_inner(
    pool: &DbPool,
    user_id: Uuid,
    xp_delta: i32,
) -> Result<()> {
    let today = Utc::now().date_naive();

    run_db(pool, move |conn| {
        // The whole bookkeeping runs in one transaction with the stats row
        // locked (`FOR UPDATE`), so two near-simultaneous events (parallel
        // Realtime tool calls, multi-device sessions) serialize instead of
        // lost-updating XP or a streak. A brand-new account is seeded with an
        // empty row first so the lock always has a row to take.
        conn.transaction::<_, AppError, _>(|conn| {
            let exists = user_stats::table
                .find(user_id)
                .first::<UserStats>(conn)
                .optional()?
                .is_some();
            if !exists {
                // `do_nothing`: two simultaneous first-touches on a brand-new
                // user race here — the second insert must be a no-op (and the
                // FOR UPDATE read below then picks up the committed row)
                // rather than a UniqueViolation that loses the touch.
                diesel::insert_into(user_stats::table)
                    .values(user_stats::user_id.eq(user_id))
                    .on_conflict(user_stats::user_id)
                    .do_nothing()
                    .execute(conn)?;
            }
            let current = user_stats::table
                .find(user_id)
                .for_update()
                .first::<UserStats>(conn)?;

            let streak_days = match current.last_active_date {
                Some(last) if last == today => current.streak_days.max(1),
                Some(last) if last == today.pred_opt().unwrap_or(today) => current.streak_days + 1,
                _ => 1,
            };
            let longest_streak = current.longest_streak.max(streak_days);
            let xp = current.xp + xp_delta;

            let stats = UserStats {
                user_id,
                xp,
                streak_days,
                longest_streak,
                last_active_date: Some(today),
                updated_at: Utc::now(),
            };
            write_stats(conn, &stats)?;

            let metrics = compute_metrics(conn, user_id, &stats)?;
            let rules = load_rules(conn)?;

            // Award, then pay out only what was actually new: the insert
            // reports the rows it created, so re-running never pays twice.
            let mut reward = 0;
            for rule in earned_rules(&rules, &metrics) {
                let inserted = diesel::insert_into(user_badges::table)
                    .values((
                        user_badges::user_id.eq(user_id),
                        user_badges::badge_id.eq(rule.id),
                    ))
                    .on_conflict((user_badges::user_id, user_badges::badge_id))
                    .do_nothing()
                    .execute(conn)?;
                if inserted > 0 {
                    reward += rule.xp_reward;
                }
            }

            // Reward XP is applied after evaluation, so an XP achievement
            // can't cascade into the next one within a single pass — the
            // next activity picks it up. Deliberate: it keeps one action
            // from chaining awards.
            if reward > 0 {
                write_stats(
                    conn,
                    &UserStats {
                        xp: xp + reward,
                        updated_at: Utc::now(),
                        ..stats
                    },
                )?;
            }

            Ok(())
        })
    })
    .await
}

fn write_stats(conn: &mut PgConnection, s: &UserStats) -> QueryResult<usize> {
    diesel::insert_into(user_stats::table)
        .values((
            user_stats::user_id.eq(s.user_id),
            user_stats::xp.eq(s.xp),
            user_stats::streak_days.eq(s.streak_days),
            user_stats::longest_streak.eq(s.longest_streak),
            user_stats::last_active_date.eq(s.last_active_date),
            user_stats::updated_at.eq(s.updated_at),
        ))
        .on_conflict(user_stats::user_id)
        .do_update()
        .set((
            user_stats::xp.eq(s.xp),
            user_stats::streak_days.eq(s.streak_days),
            user_stats::longest_streak.eq(s.longest_streak),
            user_stats::last_active_date.eq(s.last_active_date),
            user_stats::updated_at.eq(s.updated_at),
        ))
        .execute(conn)
}

#[cfg(test)]
mod tests {
    use super::{earned_rules, Metrics, Rule};
    use uuid::Uuid;

    fn rule(metric: &str, threshold: i32, scope: Option<i32>) -> Rule {
        Rule {
            id: Uuid::new_v4(),
            metric: metric.into(),
            threshold,
            scope,
            xp_reward: 10,
        }
    }

    #[test]
    fn nothing_is_earned_from_a_blank_slate() {
        let rules = vec![rule("corrections", 1, None), rule("streak_days", 3, None)];
        assert!(earned_rules(&rules, &Metrics::default()).is_empty());
    }

    #[test]
    fn thresholds_are_cumulative() {
        let rules = vec![
            rule("streak_days", 3, None),
            rule("streak_days", 7, None),
            rule("streak_days", 30, None),
        ];
        let m = Metrics {
            streak_days: 7,
            ..Default::default()
        };
        assert_eq!(earned_rules(&rules, &m).len(), 2);
    }

    #[test]
    fn planet_rules_only_read_their_own_planet() {
        let rules = vec![
            rule("planet_lessons", 4, Some(1)),
            rule("planet_lessons", 4, Some(2)),
        ];
        let mut m = Metrics::default();
        m.planet_lessons.insert(1, 4);
        m.planet_lessons.insert(2, 2);
        assert_eq!(earned_rules(&rules, &m).len(), 1);
    }

    #[test]
    fn unknown_metrics_never_award() {
        let rules = vec![
            rule("not_a_metric", 1, None),
            rule("planet_lessons", 1, None),
        ];
        let m = Metrics {
            corrections: 999,
            ..Default::default()
        };
        assert!(earned_rules(&rules, &m).is_empty());
    }
}
