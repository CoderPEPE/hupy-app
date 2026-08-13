//! Planet progression business rules: mastery aggregation, unlock status,
//! lesson completion thresholds, and the "which planet is this user on"
//! query used by the live tutor.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{ActivePlanet, Planet, PlanetProgress};
use crate::repositories;
use crate::schema::{planet_lessons, planets, user_module_progress, user_planet_progress};
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

/// True once every module of the planet is finished — the real gate on the
/// next planet, the "conquered" state and the audio story.
///
/// Mastery no longer decides this. The learner earns a planet by working
/// through its ten modules (conversation + flashcards each); the six mastery
/// metrics only describe *how well* it went, which is a different question
/// from whether it happened.
pub fn planet_finished(completed_modules: i64) -> bool {
    completed_modules >= crate::services::curriculum::MODULES_PER_PLANET as i64
}

/// Computes the display state + unlock progress for a planet.
///
/// `completed_modules` is how many of this planet's ten modules are finished;
/// `prev` is the same number for the planet before it (None for the first).
/// Progression is module-driven: a planet opens once the previous one's ten
/// modules are done, and the unlock ratio counts modules, so "locked" can tell
/// the learner exactly how far off they are.
pub fn state_for(
    p: &PlanetProgress,
    completed_modules: i64,
    prev: Option<i64>,
) -> (String, f64) {
    // Locked wins over everything: a planet you cannot reach has no progress
    // worth describing, and the ratio tells the learner how close they are.
    if let Some(prev_done) = prev {
        if !planet_finished(prev_done) {
            let ratio = prev_done as f64 / crate::services::curriculum::MODULES_PER_PLANET as f64;
            return ("locked".into(), ratio.clamp(0.0, 1.0));
        }
    }
    let state = if planet_finished(completed_modules) {
        // Finished, but a skill the tutor graded is still under the floor:
        // the spec's "revisão necessária". It suggests a pass back through
        // the planet — it does not hold the next one shut.
        if !weak_skills(p).is_empty() {
            "review"
        } else if at_least(p.mastery, MASTERED_MASTERY) {
            "mastered"
        } else {
            "conquered"
        }
    } else if completed_modules > 0 || p.mastery > 0.0 {
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


/// Total blocks per planet — exposed to the API so the app can say
/// "4 of 10 blocks completed" without hardcoding the number.
pub const TOTAL_BLOCKS: i64 = BLOCK_KINDS.len() as i64;


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
        // Finished modules per planet, in one query — the same number the
        // status chain is built from everywhere else.
        let completed: std::collections::HashMap<Uuid, i64> = user_module_progress::table
            .inner_join(
                planet_lessons::table.on(planet_lessons::id.eq(user_module_progress::lesson_id)),
            )
            .filter(user_module_progress::user_id.eq(user_id))
            .filter(user_module_progress::conversation_done.eq(true))
            .filter(user_module_progress::flashcards_done.eq(true))
            .group_by(planet_lessons::planet_id)
            .select((planet_lessons::planet_id, diesel::dsl::count_star()))
            .load::<(Uuid, i64)>(conn)?
            .into_iter()
            .collect();

        let mut prev: Option<i64> = None;
        let mut chosen: Option<&Planet> = None;
        for p in &all {
            let prog = user_planet_progress::table
                .find((user_id, p.id))
                .first::<PlanetProgress>(conn)
                .optional()?
                .unwrap_or_else(|| PlanetProgress::empty(p.id));
            let done = completed.get(&p.id).copied().unwrap_or(0);
            let (state, _) = state_for(&prog, done, prev);
            prev = Some(done);
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
    use super::{state_for, weak_skills, with_metric};
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

    /// Every planet's ten modules, finished.
    const ALL: i64 = crate::services::curriculum::MODULES_PER_PLANET as i64;

    #[test]
    fn first_planet_is_available_until_touched() {
        let (state, unlock) = state_for(&even(0.0), 0, None);
        assert_eq!(state, "available");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn in_progress_once_a_module_is_behind_them() {
        let (state, _) = state_for(&even(0.0), 3, None);
        assert_eq!(state, "in_progress");
    }

    /// Progression is module-driven now: the planet is earned by working
    /// through its ten modules, whatever the mastery average says.
    #[test]
    fn conquered_when_every_module_is_finished() {
        let (state, unlock) = state_for(&even(0.85), ALL, None);
        assert_eq!(state, "conquered");
        assert_eq!(unlock, 1.0);
    }

    /// The counterpart: a high average with modules still open is not a win.
    #[test]
    fn a_high_average_does_not_conquer_with_modules_left() {
        let (state, _) = state_for(&even(0.95), ALL - 1, None);
        assert_eq!(state, "in_progress");
    }

    #[test]
    fn mastered_above_the_domination_bar() {
        let (state, _) = state_for(&even(0.96), ALL, None);
        assert_eq!(state, "mastered");
    }

    /// The spec's §5 rule: an essential skill under 60% flags the finished
    /// planet for review. It suggests another pass — it no longer holds the
    /// next planet shut, because the modules are what earn progression.
    #[test]
    fn review_flagged_when_an_essential_skill_is_below_the_floor() {
        let mut p = even(1.0);
        p = with_metric(p, "pronunciation", 0.2);
        assert_eq!(weak_skills(&p), vec!["pronunciation"]);
        let (state, _) = state_for(&p, ALL, None);
        assert_eq!(state, "review");
        // The next planet still opens: its gate is the ten finished modules.
        let (next, _) = state_for(&even(0.0), 0, Some(ALL));
        assert_eq!(next, "available");
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
    /// flags a review on its own.
    #[test]
    fn weak_review_mechanics_do_not_flag_a_review() {
        let mut p = even(1.0);
        p = with_metric(p, "flashcards", 0.5);
        p = with_metric(p, "review", 0.5);
        assert!(weak_skills(&p).is_empty());
        // Finished cleanly — the weak review metrics only keep it off the
        // "mastered" tier, they do not ask for another pass.
        assert_eq!(state_for(&p, ALL, None).0, "conquered");
    }

    #[test]
    fn unlocked_when_the_previous_planet_finished_its_modules() {
        let (state, unlock) = state_for(&even(0.0), 2, Some(ALL));
        assert_eq!(state, "in_progress");
        assert_eq!(unlock, 1.0);
    }

    /// Locked until then — and the ratio counts modules, so the app can say
    /// exactly how far off the learner is.
    #[test]
    fn locked_until_the_previous_planet_is_finished() {
        let (state, unlock) = state_for(&even(0.0), 0, Some(5));
        assert_eq!(state, "locked");
        assert!((unlock - 0.5).abs() < 1e-9);
    }

}
