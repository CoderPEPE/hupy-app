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

/// `mastery` is never set directly: it is always the average of the other 6
/// tracked metrics, recomputed every time one of them changes.
pub fn compute_mastery(p: &PlanetProgress) -> f64 {
    (p.sentences + p.pronunciation + p.conversation + p.listening + p.flashcards + p.review) / 6.0
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

/// Computes the display status + unlock progress for a planet given the
/// previous planet's mastery (locked planets only unlock via mastery).
/// `prev` is (previous planet mastery, previous unlock threshold).
pub fn status_for(mastery: f64, unlock_mastery: f64, prev: Option<(f64, f64)>) -> (String, f64) {
    if mastery >= unlock_mastery {
        return ("completed".into(), 1.0);
    }
    match prev {
        None => ("active".into(), 1.0),
        Some((prev_mastery, prev_unlock)) => {
            if prev_mastery >= prev_unlock {
                ("active".into(), 1.0)
            } else {
                let ratio = prev_mastery / prev_unlock;
                ("locked".into(), ratio.clamp(0.0, 1.0))
            }
        }
    }
}

/// A lesson is completed when the user's mastery crosses its threshold — the
/// demo lesson bumps mastery, so replaying it genuinely completes lessons.
pub fn lesson_completed(kind: &str, mastery: f64) -> bool {
    match kind {
        "learn" => mastery >= 0.1,
        "practice" => mastery >= 0.25,
        "test" => mastery >= 0.45,
        "master" => mastery >= 0.8,
        _ => false,
    }
}

/// The four lesson kinds, in path order — the single source of truth for
/// "how many lessons does a planet have".
pub const LESSON_KINDS: [&str; 4] = ["learn", "practice", "test", "master"];

/// How many of a planet's four lessons the given mastery has completed. The
/// achievement rules count lessons with this, so a lesson badge and the lesson
/// list can never disagree about what "completed" means.
pub fn lessons_completed_count(mastery: f64) -> i64 {
    LESSON_KINDS
        .iter()
        .filter(|kind| lesson_completed(kind, mastery))
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
/// mastered, flashcards graduated) rather than a delta.
pub async fn set_metric_absolute(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    metric: &str,
    value: f64,
) -> Result<f64> {
    let current = repositories::planets::load_progress(pool, user_id, planet_id).await?;
    let updated = with_metric(current, metric, value);
    let mastery = updated.mastery;
    repositories::planets::store_progress(pool, user_id, updated).await?;
    Ok(mastery)
}

/// Bumps one metric by a delta (clamped to 0..1) and persists the recomputed
/// mastery. Used for the AI's qualitative judgment calls during a live session.
pub async fn bump_metric_delta(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Uuid,
    metric: &str,
    delta: f64,
) -> Result<f64> {
    let current = repositories::planets::load_progress(pool, user_id, planet_id).await?;
    let next = current.metric(metric) + delta;
    set_metric_absolute(pool, user_id, planet_id, metric, next).await
}

// ---------------------------------------------------------------------------
// Current planet
// ---------------------------------------------------------------------------

/// The user's current planet: the first one whose status isn't "completed"
/// (mirrors `status_for`'s own logic, so it's always exactly the planet the
/// Planets tab shows as "active"). Falls back to the last planet if every
/// planet has been completed.
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
        let mut prev: Option<(f64, f64)> = None;
        let mut chosen: Option<&Planet> = None;
        for p in &all {
            let prog = user_planet_progress::table
                .find((user_id, p.id))
                .first::<PlanetProgress>(conn)
                .optional()?
                .unwrap_or_else(|| PlanetProgress::empty(p.id));
            let (status, _) = status_for(prog.mastery, p.unlock_mastery, prev);
            prev = Some((prog.mastery, p.unlock_mastery));
            if status != "completed" && chosen.is_none() {
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
    use super::{status_for, with_metric};
    use crate::models::PlanetProgress;
    use uuid::Uuid;

    #[test]
    fn first_planet_is_active() {
        let (status, unlock) = status_for(0.0, 0.8, None);
        assert_eq!(status, "active");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn completed_when_mastery_passes_threshold() {
        let (status, unlock) = status_for(0.8, 0.8, None);
        assert_eq!(status, "completed");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn unlocked_when_previous_planet_is_completed() {
        let (status, unlock) = status_for(0.2, 0.8, Some((0.9, 0.8)));
        assert_eq!(status, "active");
        assert_eq!(unlock, 1.0);
    }

    #[test]
    fn locked_until_previous_reaches_threshold() {
        let (status, unlock) = status_for(0.2, 0.8, Some((0.4, 0.8)));
        assert_eq!(status, "locked");
        assert!((unlock - 0.5).abs() < 1e-9);
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
