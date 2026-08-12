//! Planet progression business rules: mastery aggregation, unlock status,
//! lesson completion thresholds, and the "which planet is this user on"
//! query used by the live tutor.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{ActivePlanet, Planet, PlanetProgress};
use crate::repositories;
use crate::schema::{planets, user_planet_progress};
use diesel::prelude::*;
use diesel::OptionalExtension;
use uuid::Uuid;

/// The metrics `POST /planets/:id/progress` accepts — the tutor's qualitative
/// judgment calls. `sentences` and `flashcards` are derived from real counts
/// elsewhere; `mastery` is always the computed average, never written directly.
pub const BUMPABLE_METRICS: [&str; 4] = ["pronunciation", "conversation", "listening", "review"];

/// The largest delta `POST /planets/:id/progress` accepts per call. The live
/// tutor's tool schema grades each turn at 0.03–0.15 (see the realtime
/// prompt), so anything larger is a hand-crafted request — allowing the old
/// ±1.0 would let four calls max out every metric and unlock the whole course
/// in as many seconds.
pub const MAX_BUMP_DELTA: f64 = 0.15;

/// `mastery` is never set directly: it is always the average of the other 6
/// tracked metrics, recomputed every time one of them changes.
pub fn compute_mastery(p: &PlanetProgress) -> f64 {
    (p.sentences + p.pronunciation + p.conversation + p.listening + p.flashcards + p.review) / 6.0
}

/// Threshold comparison with a rounding tolerance.
///
/// Mastery is an average of six floats, so a learner sitting *exactly* on a
/// threshold lands just under it: six metrics of 0.8 average to
/// 0.7999999999999999, which a bare `>=` reads as "not there yet" — the
/// planet would never unlock. Every threshold check goes through here.
pub fn at_least(value: f64, threshold: f64) -> bool {
    value >= threshold - 1e-9
}

/// Sets one metric to an absolute value (clamped 0..1) and recomputes mastery.
pub fn with_metric(mut p: PlanetProgress, metric: &str, value: f64) -> PlanetProgress {
    let value = value.clamp(0.0, 1.0);
    match metric {
        "sentences" => p.sentences = value,
        "pronunciation" => p.pronunciation = value,
        "conversation" => p.conversation = value,
        "listening" => p.listening = value,
        "flashcards" => p.flashcards = value,
        "review" => p.review = value,
        _ => {}
    }
    p.mastery = compute_mastery(&p);
    p
}

/// The skills the spec calls *essential* (§5 "Nenhuma habilidade essencial
/// abaixo de 60%"): a planet is not conquered while any of them is weak, no
/// matter how high the average is. `flashcards` and `review` are review
/// mechanics rather than skills, so they only feed the mastery average.
pub const ESSENTIAL_SKILLS: [&str; 4] = ["sentences", "listening", "pronunciation", "conversation"];

/// The floor every essential skill must clear (spec §5).
pub const MIN_ESSENTIAL_SKILL: f64 = 0.60;

/// Mastery above which a conquered planet counts as "dominado" — the learner
/// is not just past the bar, they own the content.
pub const MASTERED_MASTERY: f64 = 0.95;

/// The essential skills currently sitting below the floor — what a "review
/// needed" badge points at, and what a personalized review must target.
pub fn weak_skills(p: &PlanetProgress) -> Vec<&'static str> {
    ESSENTIAL_SKILLS
        .into_iter()
        .filter(|s| !at_least(p.metric(s), MIN_ESSENTIAL_SKILL))
        .collect()
}

/// The skills a *pending review* actually targets — [`weak_skills`], but only
/// once the learner has worked through the whole path.
///
/// A brand-new planet has every skill at zero, which is "below the floor" but
/// is not something to revisit: you cannot review what you have not learned.
/// This is the list the app shows; `weak_skills` stays a pure predicate for
/// the completion rule.
pub fn pending_review_skills(p: &PlanetProgress) -> Vec<&'static str> {
    if at_least(p.mastery, MISSION_THRESHOLD) {
        weak_skills(p)
    } else {
        Vec::new()
    }
}

/// The spec's completion rule (§5): all ten blocks done (mastery past the
/// mission threshold, which is the planet's unlock threshold) **and** no
/// essential skill below 60%. This single predicate gates unlocking the next
/// planet, the "conquered" state and the final audio story, so those three
/// can never disagree.
pub fn is_conquered(p: &PlanetProgress, unlock_mastery: f64) -> bool {
    at_least(p.mastery, unlock_mastery) && weak_skills(p).is_empty()
}

/// Computes the display state + unlock progress for a planet, given the
/// previous planet's progress (locked planets only open once the previous one
/// is conquered). The six states are the spec's §6 list.
///
/// `prev` is (previous planet progress, previous unlock threshold).
pub fn state_for(
    p: &PlanetProgress,
    unlock_mastery: f64,
    prev: Option<(&PlanetProgress, f64)>,
) -> (String, f64) {
    // Locked wins over everything: a planet you cannot reach has no progress
    // worth describing, and the ratio tells the learner how close they are.
    if let Some((prev_p, prev_unlock)) = prev {
        if !is_conquered(prev_p, prev_unlock) {
            let ratio = if prev_unlock > 0.0 {
                prev_p.mastery / prev_unlock
            } else {
                1.0
            };
            return ("locked".into(), ratio.clamp(0.0, 1.0));
        }
    }
    let state = if is_conquered(p, unlock_mastery) {
        if at_least(p.mastery, MASTERED_MASTERY) {
            "mastered"
        } else {
            "conquered"
        }
    } else if at_least(p.mastery, unlock_mastery) {
        // Every block is done but a skill is still under the floor — the spec's
        // "revisão necessária": a short targeted review, not the whole planet.
        "review"
    } else if p.mastery > 0.0 {
        "in_progress"
    } else {
        "available"
    };
    (state.into(), 1.0)
}

/// True for the two states that mean "this planet is behind the learner".
pub fn is_finished_state(state: &str) -> bool {
    state == "conquered" || state == "mastered"
}

/// A block is completed when the user's mastery crosses its threshold — the
/// demo lesson bumps mastery, so replaying it genuinely completes blocks.
/// The tenth block ("mission") requires the same 0.8 mastery that unlocks
/// the next planet, so "10 of 10 blocks" and "planet conquered" always agree.
pub fn lesson_completed(kind: &str, mastery: f64) -> bool {
    BLOCK_KINDS
        .iter()
        .any(|(k, threshold, _)| *k == kind && at_least(mastery, *threshold))
}

/// The ten block kinds, in path order: (kind, mastery threshold that marks it
/// complete, the progress metric the block trains). The single source of
/// truth for "how many blocks does a planet have" (the spec's standard
/// 10-block structure) and for which skill a block's review targets.
pub const BLOCK_KINDS: [(&str, f64, &str); 10] = [
    ("context", 0.08, "conversation"),
    ("vocabulary", 0.16, "sentences"),
    ("phrases", 0.24, "sentences"),
    ("structure", 0.32, "sentences"),
    ("listening", 0.40, "listening"),
    ("pronunciation", 0.48, "pronunciation"),
    ("recall", 0.56, "review"),
    ("variations", 0.64, "sentences"),
    ("conversation", 0.72, "conversation"),
    ("mission", 0.80, "conversation"),
];

/// Mastery at or above which a completed block counts as "dominado".
const BLOCK_MASTERED_SKILL: f64 = 0.90;

/// Mastery that completes the tenth block ("mission") — the point from which
/// every block on the planet is done.
pub const MISSION_THRESHOLD: f64 = BLOCK_KINDS[9].1;

/// The skill a block trains ("" for an unknown kind).
pub fn block_skill(kind: &str) -> &'static str {
    BLOCK_KINDS
        .iter()
        .find(|(k, _, _)| *k == kind)
        .map(|(_, _, skill)| *skill)
        .unwrap_or("")
}

/// The spec's six block states (§6). `prev_completed` is whether the block
/// before this one is done — the path unlocks strictly in order.
pub fn block_state(kind: &str, p: &PlanetProgress, prev_completed: bool) -> String {
    let skill = block_skill(kind);
    if lesson_completed(kind, p.mastery) {
        let level = p.metric(skill);
        // "Revisar" only once the whole path is behind the learner: mid-planet
        // an early block's skill is naturally still low, and flagging it then
        // would mark blocks for review the learner has not finished learning.
        let planet_done = at_least(p.mastery, MISSION_THRESHOLD);
        if at_least(level, BLOCK_MASTERED_SKILL) {
            "mastered".into()
        } else if planet_done && !at_least(level, MIN_ESSENTIAL_SKILL) && ESSENTIAL_SKILLS.contains(&skill) {
            // Done, but the skill it trains sits below the floor: this is the
            // block the planet's pending review sends the learner back to.
            "review".into()
        } else {
            "completed".into()
        }
    } else if !prev_completed {
        "locked".into()
    } else if p.mastery > 0.0 {
        "in_progress".into()
    } else {
        "available".into()
    }
}

/// Total blocks per planet — exposed to the API so the app can say
/// "4 of 10 blocks completed" without hardcoding the number.
pub const TOTAL_BLOCKS: i64 = BLOCK_KINDS.len() as i64;

/// How many of a planet's ten blocks the given mastery has completed. The
/// achievement rules count blocks with this, so a block badge and the block
/// list can never disagree about what "completed" means.
pub fn lessons_completed_count(mastery: f64) -> i64 {
    BLOCK_KINDS
        .iter()
        .filter(|(_, threshold, _)| at_least(mastery, *threshold))
        .count() as i64
}

/// The "sentences" progress metric: mastered/total, 0 when the planet has no
/// sentences.
pub fn sentences_progress(mastered: i64, total: i64) -> f64 {
    if total > 0 {
        mastered as f64 / total as f64
    } else {
        0.0
    }
}

// ---------------------------------------------------------------------------
// Progress mutations (shared by the progress endpoint, sentence mastery, and
// flashcard review)
// ---------------------------------------------------------------------------

/// Sets one metric to an absolute value (0..1) and persists the recomputed
/// mastery. Used for metrics that reflect real, countable state (sentences
/// mastered, flashcards graduated) rather than a delta. The read-modify-write
/// is atomic (row lock + transaction), so an absolute write can never
/// clobber a concurrent delta on another metric of the same planet.
pub async fn set_metric_absolute(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    metric: &str,
    value: f64,
) -> Result<f64> {
    let metric = metric.to_string();
    repositories::planets::mutate_progress(pool, user_id, planet_id, move |p| {
        *p = with_metric(p.clone(), &metric, value);
    })
    .await
}

/// Bumps one metric by a delta (clamped to 0..1) and persists the recomputed
/// mastery. Used for the AI's qualitative judgment calls during a live
/// session. Atomic like [`set_metric_absolute`], so concurrent bumps on the
/// same planet can't lose each other's delta.
pub async fn bump_metric_delta(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    metric: &str,
    delta: f64,
) -> Result<f64> {
    let metric = metric.to_string();
    repositories::planets::mutate_progress(pool, user_id, planet_id, move |p| {
        let next = p.metric(&metric) + delta;
        *p = with_metric(p.clone(), &metric, next);
    })
    .await
}

// ---------------------------------------------------------------------------
// Current planet
// ---------------------------------------------------------------------------

/// The user's current planet: the first one the learner hasn't conquered
/// (mirrors `state_for`'s own logic, so it's always exactly the planet the
/// Planets tab highlights). Falls back to the last planet if every planet has
/// been conquered.
///
/// Runs as a single unit of work because it needs all planets and their
/// progress rows on one connection to evaluate the status chain exactly as
/// the list endpoint does.
pub async fn active_planet_for(pool: &DbPool, user_id: Uuid) -> Result<ActivePlanet> {
    // Only the user's own course matters — the same planet numbers exist in
    // six base→target courses, so the status chain must never cross courses.
    let (base_language, language) = repositories::users::find_by_id(pool, user_id)
        .await?
        .map(|u| (u.base_language, u.language))
        .unwrap_or_else(|| ("pt".into(), "en".into()));
    run_db(pool, move |conn| {
        let all: Vec<Planet> = planets::table
            .filter(planets::base_language.eq(&base_language))
            .filter(planets::language.eq(&language))
            .order(planets::number.asc())
            .load(conn)?;
        let mut prev: Option<(PlanetProgress, f64)> = None;
        let mut chosen: Option<&Planet> = None;
        for p in &all {
            let prog = user_planet_progress::table
                .find((user_id, p.id))
                .first::<PlanetProgress>(conn)
                .optional()?
                .unwrap_or_else(|| PlanetProgress::empty(p.id));
            let (state, _) = state_for(
                &prog,
                p.unlock_mastery,
                prev.as_ref().map(|(pp, u)| (pp, *u)),
            );
            prev = Some((prog, p.unlock_mastery));
            if !is_finished_state(&state) && chosen.is_none() {
                chosen = Some(p);
            }
        }
        let planet = chosen.or_else(|| all.last());
        match planet {
            Some(p) => Ok(ActivePlanet {
                id: p.id,
                number: p.number,
                title: p.title.clone(),
                base_language: p.base_language.clone(),
                language: p.language.clone(),
            }),
            None => Err(AppError::internal("no planets configured")),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        block_state, is_conquered, lessons_completed_count, state_for, weak_skills, with_metric,
        TOTAL_BLOCKS,
    };
    use crate::models::PlanetProgress;
    use uuid::Uuid;

    /// A progress row with every metric at `level` — mastery is the average,
    /// so it lands on `level` too.
    fn even(level: f64) -> PlanetProgress {
        let mut p = PlanetProgress::empty(Uuid::nil());
        for m in ["sentences", "pronunciation", "conversation", "listening", "flashcards", "review"] {
            p = with_metric(p, m, level);
        }
        p
    }

    #[test]
    fn first_planet_is_available_until_touched() {
        let (state, unlock) = state_for(&even(0.0), 0.8, None);
        assert_eq!(state, "available");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn in_progress_once_any_mastery_exists() {
        let (state, _) = state_for(&even(0.3), 0.8, None);
        assert_eq!(state, "in_progress");
    }

    #[test]
    fn conquered_when_mastery_passes_threshold_with_no_weak_skill() {
        let (state, unlock) = state_for(&even(0.85), 0.8, None);
        assert_eq!(state, "conquered");
        assert_eq!(unlock, 1.0);
    }

    /// Six metrics of exactly 0.8 average to 0.7999999999999999 in f64. A bare
    /// `>=` would read that as "not there yet" and the planet would never
    /// unlock, so sitting exactly on a threshold must count as reaching it.
    #[test]
    fn sitting_exactly_on_a_threshold_counts_as_reaching_it() {
        let p = even(0.8);
        assert!(p.mastery < 0.8, "the average really does land just under");
        assert!(is_conquered(&p, 0.8));
        assert_eq!(state_for(&p, 0.8, None).0, "conquered");
        assert_eq!(lessons_completed_count(p.mastery), TOTAL_BLOCKS);
    }

    #[test]
    fn mastered_above_the_domination_bar() {
        let (state, _) = state_for(&even(0.96), 0.8, None);
        assert_eq!(state, "mastered");
    }

    /// The spec's §5 rule: a high average does not conquer a planet while an
    /// essential skill is under 60% — that is a pending review, not a win.
    #[test]
    fn review_needed_when_an_essential_skill_is_below_the_floor() {
        let mut p = even(1.0);
        p = with_metric(p, "pronunciation", 0.2);
        assert!(p.mastery >= 0.8, "average is still above the bar");
        assert!(!is_conquered(&p, 0.8));
        assert_eq!(weak_skills(&p), vec!["pronunciation"]);
        let (state, _) = state_for(&p, 0.8, None);
        assert_eq!(state, "review");
    }

    /// Zero is "below the floor" for every skill, but an untouched planet has
    /// nothing to revisit — the review list must stay empty until the learner
    /// has actually worked through the path.
    #[test]
    fn an_untouched_planet_has_no_pending_review() {
        assert!(super::pending_review_skills(&even(0.0)).is_empty());
        assert!(super::pending_review_skills(&even(0.3)).is_empty());
        let mut done = even(1.0);
        done = with_metric(done, "pronunciation", 0.1);
        assert_eq!(super::pending_review_skills(&done), vec!["pronunciation"]);
    }

    /// A weak *non-essential* metric is only a drag on the average — it never
    /// blocks conquering on its own.
    #[test]
    fn weak_review_mechanics_do_not_block_conquering() {
        let mut p = even(1.0);
        p = with_metric(p, "flashcards", 0.5);
        p = with_metric(p, "review", 0.5);
        assert!(p.mastery >= 0.8);
        assert!(weak_skills(&p).is_empty());
        assert!(is_conquered(&p, 0.8));
    }

    #[test]
    fn unlocked_when_previous_planet_is_conquered() {
        let prev = even(0.9);
        let (state, unlock) = state_for(&even(0.2), 0.8, Some((&prev, 0.8)));
        assert_eq!(state, "in_progress");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn locked_until_previous_reaches_threshold() {
        let prev = even(0.4);
        let (state, unlock) = state_for(&even(0.2), 0.8, Some((&prev, 0.8)));
        assert_eq!(state, "locked");
        assert!((unlock - 0.5).abs() < 1e-9);
    }

    /// A previous planet that averages past the bar but has a weak skill has
    /// not been conquered, so the next planet stays shut.
    #[test]
    fn locked_while_the_previous_planet_still_owes_a_review() {
        let mut prev = even(1.0);
        prev = with_metric(prev, "listening", 0.1);
        let (state, _) = state_for(&even(0.0), 0.8, Some((&prev, 0.8)));
        assert_eq!(state, "locked");
    }

    #[test]
    fn block_states_follow_the_path_in_order() {
        let p = even(0.3); // context + vocabulary + phrases done (0.08/0.16/0.24)
        assert_eq!(block_state("context", &p, true), "completed");
        assert_eq!(block_state("structure", &p, true), "in_progress");
        assert_eq!(block_state("listening", &p, false), "locked");
        assert_eq!(block_state("context", &PlanetProgress::empty(Uuid::nil()), true), "available");
    }

    /// A finished block whose skill has decayed below the floor is the exact
    /// block the planet's pending review points at.
    #[test]
    fn a_completed_block_with_a_weak_skill_asks_for_review() {
        let mut p = even(1.0);
        p = with_metric(p, "pronunciation", 0.1);
        assert_eq!(block_state("pronunciation", &p, true), "review");
        assert_eq!(block_state("listening", &p, true), "mastered");
    }

    #[test]
    fn mastery_is_the_average_of_six_submetrics() {
        let mut p = PlanetProgress::empty(Uuid::nil());
        p.sentences = 1.0;
        p.pronunciation = 0.5;
        p.conversation = 0.5;
        p.listening = 0.0;
        p.flashcards = 0.0;
        p.review = 0.0;
        let p = with_metric(p, "review", 0.0); // no-op change, just triggers recompute
        assert!((p.mastery - 1.0 / 3.0).abs() < 1e-9);
    }

    #[test]
    fn with_metric_clamps_to_0_1_and_recomputes_mastery() {
        let p = PlanetProgress::empty(Uuid::nil());
        let p = with_metric(p, "pronunciation", 5.0);
        assert_eq!(p.pronunciation, 1.0);
        assert!((p.mastery - 1.0 / 6.0).abs() < 1e-9);
    }

    #[test]
    fn unknown_metric_leaves_values_unchanged_but_still_recomputes() {
        let p = PlanetProgress::empty(Uuid::nil());
        let p = with_metric(p, "not_a_real_metric", 0.9);
        assert_eq!(p.mastery, 0.0);
    }

    #[test]
    fn sentences_progress_is_a_ratio() {
        assert_eq!(super::sentences_progress(3, 6), 0.5);
        assert_eq!(super::sentences_progress(0, 0), 0.0);
        assert_eq!(super::sentences_progress(2, 0), 0.0);
    }
}
