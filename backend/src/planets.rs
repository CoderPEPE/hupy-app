use crate::auth::AuthUser;
use crate::db::run_db;
use crate::errors::AppError;
use crate::schema::{lesson_steps, planet_lessons, planet_sentences, planets, user_planet_progress, user_sentence_progress};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_planets))
        .route("/{id}", get(planet_detail))
        .route("/{id}/lesson", get(planet_lesson))
        .route("/{id}/progress", axum::routing::post(bump_progress))
        .route("/{id}/sentences/{sentence_id}/master", axum::routing::post(master_sentence))
}

// ---------------------------------------------------------------------------

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = planets)]
struct Planet {
    id: Uuid,
    number: i32,
    title: String,
    subtitle: String,
    color: String,
    topics: Value,
    unlock_mastery: f64,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = user_planet_progress)]
struct PlanetProgress {
    #[allow(dead_code)]
    user_id: Uuid,
    planet_id: Uuid,
    sentences: f64,
    pronunciation: f64,
    conversation: f64,
    listening: f64,
    flashcards: f64,
    review: f64,
    mastery: f64,
}

impl PlanetProgress {
    fn empty(planet_id: Uuid) -> Self {
        Self {
            user_id: Uuid::nil(),
            planet_id,
            sentences: 0.0,
            pronunciation: 0.0,
            conversation: 0.0,
            listening: 0.0,
            flashcards: 0.0,
            review: 0.0,
            mastery: 0.0,
        }
    }

    fn metric(&self, name: &str) -> f64 {
        match name {
            "sentences" => self.sentences,
            "pronunciation" => self.pronunciation,
            "conversation" => self.conversation,
            "listening" => self.listening,
            "flashcards" => self.flashcards,
            "review" => self.review,
            "mastery" => self.mastery,
            _ => 0.0,
        }
    }
}

const METRICS: [&str; 7] = [
    "sentences",
    "pronunciation",
    "conversation",
    "listening",
    "flashcards",
    "review",
    "mastery",
];

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ProgressJson {
    pub sentences: f64,
    pub pronunciation: f64,
    pub conversation: f64,
    pub listening: f64,
    pub flashcards: f64,
    pub review: f64,
    pub mastery: f64,
}

impl From<&PlanetProgress> for ProgressJson {
    fn from(p: &PlanetProgress) -> Self {
        Self {
            sentences: p.sentences,
            pronunciation: p.pronunciation,
            conversation: p.conversation,
            listening: p.listening,
            flashcards: p.flashcards,
            review: p.review,
            mastery: p.mastery,
        }
    }
}

#[derive(Serialize)]
pub struct PlanetSummary {
    pub id: Uuid,
    pub number: i32,
    pub title: String,
    pub subtitle: String,
    pub color: String,
    pub topics: Value,
    pub created_at: DateTime<Utc>,
    /// "active" | "locked" | "completed"
    pub status: String,
    /// 0..1 — how close this planet is to being unlocked (previous planet mastery).
    pub unlock_progress: f64,
    pub mastered_sentences: i64,
    pub total_sentences: i64,
    pub progress: ProgressJson,
}

#[derive(Serialize)]
pub struct SentenceJson {
    pub id: Uuid,
    pub position: i32,
    pub en: String,
    pub pt: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub mastered: bool,
}

/// A correction embedded in a lesson step (kind = "correction").
#[derive(Serialize)]
pub struct LessonCorrectionJson {
    pub said: String,
    pub corrected: String,
    pub explanation: String,
    pub pt: String,
    pub mistake_part: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
}

#[derive(Serialize)]
pub struct LessonStepJson {
    pub id: Uuid,
    pub kind: String,
    pub tutor: String,
    pub expected: Option<String>,
    pub mastery_gain: Option<f64>,
    pub correction: Option<LessonCorrectionJson>,
}

#[derive(Serialize)]
pub struct LessonJson {
    pub planet_id: Uuid,
    pub steps: Vec<LessonStepJson>,
}

/// One step of the planet's lesson path (Learn -> Practice -> Test -> Master).
/// `completed`/`locked` are computed per-user from their progress.
#[derive(Serialize)]
pub struct PlanetLessonJson {
    pub id: Uuid,
    pub position: i32,
    pub kind: String,
    pub title: String,
    pub description: String,
    pub completed: bool,
    pub locked: bool,
}

#[derive(Serialize)]
pub struct PlanetDetail {
    #[serde(flatten)]
    pub summary: PlanetSummary,
    pub sentences: Vec<SentenceJson>,
    pub lessons: Vec<PlanetLessonJson>,
}

/// A lesson is completed when the user's mastery crosses its threshold — the
/// demo lesson bumps mastery, so replaying it genuinely completes lessons.
fn lesson_completed(kind: &str, mastery: f64) -> bool {
    match kind {
        "learn" => mastery >= 0.1,
        "practice" => mastery >= 0.25,
        "test" => mastery >= 0.45,
        "master" => mastery >= 0.8,
        _ => false,
    }
}

/// Computes the display status + unlock progress for a planet given the
/// previous planet's mastery (locked planets only unlock via mastery).
/// `prev` is (previous planet mastery, previous unlock threshold).
fn status_for(mastery: f64, unlock_mastery: f64, prev: Option<(f64, f64)>) -> (String, f64) {
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

#[cfg(test)]
mod tests {
    use super::status_for;

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
}

/// Loads a planet's progress row for a user (defaults to zeros).
async fn load_progress(pool: &crate::db::DbPool, user_id: Uuid, planet_id: Uuid) -> Result<PlanetProgress, AppError> {
    run_db(pool, move |conn| {
        Ok(user_planet_progress::table
            .find((user_id, planet_id))
            .first::<PlanetProgress>(conn)
            .optional()?
            .unwrap_or_else(|| PlanetProgress::empty(planet_id)))
    })
    .await
}

async fn mastered_sentence_count(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<i64, AppError> {
    run_db(pool, move |conn| {
        Ok(user_sentence_progress::table
            .inner_join(planet_sentences::table.on(planet_sentences::id.eq(user_sentence_progress::sentence_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?)
    })
    .await
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_planets(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<PlanetSummary>>, AppError> {
    let summaries = run_db(&state.pool, move |conn| {
        let all: Vec<Planet> = planets::table.order(planets::number.asc()).load(conn)?;

        // All progress rows for this user, keyed by planet id.
        let rows: Vec<PlanetProgress> = user_planet_progress::table
            .filter(user_planet_progress::user_id.eq(user_id))
            .load(conn)?;
        let mut by_planet: std::collections::HashMap<Uuid, PlanetProgress> =
            rows.into_iter().map(|r| (r.planet_id, r)).collect();

        // Total sentence counts per planet.
        let mut totals: std::collections::HashMap<Uuid, i64> = std::collections::HashMap::new();
        for row in planet_sentences::table
            .group_by(planet_sentences::planet_id)
            .select((planet_sentences::planet_id, diesel::dsl::count(planet_sentences::id)))
            .load::<(Uuid, i64)>(conn)?
        {
            totals.insert(row.0, row.1);
        }

        // Mastered counts per planet.
        let mastered: Vec<(Uuid, i64)> = user_sentence_progress::table
            .inner_join(planet_sentences::table.on(planet_sentences::id.eq(user_sentence_progress::sentence_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .group_by(planet_sentences::planet_id)
            .select((planet_sentences::planet_id, diesel::dsl::count(planet_sentences::id)))
            .load(conn)?;
        let mastered_map: std::collections::HashMap<Uuid, i64> = mastered.into_iter().collect();

        let mut out = Vec::with_capacity(all.len());
        let mut prev: Option<(f64, f64)> = None;
        for p in &all {
            let prog = by_planet.remove(&p.id).unwrap_or_else(|| PlanetProgress::empty(p.id));
            let (status, unlock) = status_for(prog.mastery, p.unlock_mastery, prev);
            out.push(PlanetSummary {
                id: p.id,
                number: p.number,
                title: p.title.clone(),
                subtitle: p.subtitle.clone(),
                color: p.color.clone(),
                topics: p.topics.clone(),
                created_at: p.created_at,
                status,
                unlock_progress: unlock,
                mastered_sentences: mastered_map.get(&p.id).copied().unwrap_or(0),
                total_sentences: totals.get(&p.id).copied().unwrap_or(0),
                progress: ProgressJson::from(&prog),
            });
            prev = Some((prog.mastery, p.unlock_mastery));
        }
        Ok(out)
    })
    .await?;

    Ok(Json(summaries))
}

async fn planet_detail(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<PlanetDetail>, AppError> {
    let detail = run_db(&state.pool, move |conn| {
        let planet: Planet = planets::table
            .find(planet_id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("planet not found".into()))?;

        let all: Vec<Planet> = planets::table.order(planets::number.asc()).load(conn)?;
        let idx = all.iter().position(|p| p.id == planet_id).unwrap_or(0);
        let prev = if idx > 0 { Some(&all[idx - 1]) } else { None };
        let prev_progress = match prev {
            Some(p) => Some(user_planet_progress::table
                .find((user_id, p.id))
                .first::<PlanetProgress>(conn)
                .optional()?
                .unwrap_or_else(|| PlanetProgress::empty(p.id))),
            None => None,
        };

        let progress = user_planet_progress::table
            .find((user_id, planet_id))
            .first::<PlanetProgress>(conn)
            .optional()?
            .unwrap_or_else(|| PlanetProgress::empty(planet_id));

        let prev_info = prev
            .zip(prev_progress.as_ref())
            .map(|(p, pp)| (pp.mastery, p.unlock_mastery));
        let (status, unlock) = status_for(progress.mastery, planet.unlock_mastery, prev_info);

        let total: i64 = planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;
        let mastered: i64 = user_sentence_progress::table
            .inner_join(planet_sentences::table.on(planet_sentences::id.eq(user_sentence_progress::sentence_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?;

        // Mastered sentence ids for this user+planet (single query, no N+1).
        let mastered_ids: Vec<Uuid> = user_sentence_progress::table
            .inner_join(planet_sentences::table.on(planet_sentences::id.eq(user_sentence_progress::sentence_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .select(user_sentence_progress::sentence_id)
            .load(conn)?;
        let mastered_set: std::collections::HashSet<Uuid> = mastered_ids.into_iter().collect();

        let sentences: Vec<SentenceJson> = planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .order(planet_sentences::position.asc())
            .select((
                planet_sentences::id,
                planet_sentences::position,
                planet_sentences::en,
                planet_sentences::pt,
                planet_sentences::subject,
                planet_sentences::verb,
                planet_sentences::complement,
            ))
            .load::<(Uuid, i32, String, String, String, String, String)>(conn)?
            .into_iter()
            .map(|(id, position, en, pt, subject, verb, complement)| SentenceJson {
                id,
                position,
                en,
                pt,
                subject,
                verb,
                complement,
                mastered: mastered_set.contains(&id),
            })
            .collect();

        // Lesson path: Learn -> Practice -> Test -> Master, with per-user
        // completion derived from mastery, and each lesson locked until the
        // previous one is completed.
        let rows: Vec<(Uuid, i32, String, String, String)> = planet_lessons::table
            .filter(planet_lessons::planet_id.eq(planet_id))
            .order(planet_lessons::position.asc())
            .select((
                planet_lessons::id,
                planet_lessons::position,
                planet_lessons::kind,
                planet_lessons::title,
                planet_lessons::description,
            ))
            .load(conn)?;
        let mut prev_completed = true;
        let lessons = rows
            .into_iter()
            .map(|(id, position, kind, title, description)| {
                let completed = lesson_completed(&kind, progress.mastery);
                let locked = !prev_completed;
                prev_completed = completed;
                PlanetLessonJson {
                    id,
                    position,
                    kind,
                    title,
                    description,
                    completed,
                    locked,
                }
            })
            .collect::<Vec<_>>();

        let summary = PlanetSummary {
            id: planet.id,
            number: planet.number,
            title: planet.title,
            subtitle: planet.subtitle,
            color: planet.color,
            topics: planet.topics,
            created_at: planet.created_at,
            status,
            unlock_progress: unlock,
            mastered_sentences: mastered,
            total_sentences: total,
            progress: ProgressJson::from(&progress),
        };

        Ok(PlanetDetail {
            summary,
            sentences,
            lessons,
        })
    })
    .await?;

    Ok(Json(detail))
}

/// Returns the scripted pedagogical lesson for a planet (the Huppy cycle:
/// teach -> repeat -> question -> correction -> review -> praise).
async fn planet_lesson(
    State(state): State<AppState>,
    AuthUser(_user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<LessonJson>, AppError> {
    let exists: i64 = run_db(&state.pool, move |conn| {
        Ok(planets::table
            .filter(planets::id.eq(planet_id))
            .count()
            .get_result(conn)?)
    })
    .await?;
    if exists == 0 {
        return Err(AppError::NotFound("planet not found".into()));
    }

    let steps = run_db(&state.pool, move |conn| {
        Ok(lesson_steps::table
            .filter(lesson_steps::planet_id.eq(planet_id))
            .order(lesson_steps::position.asc())
            .select((
                lesson_steps::id,
                lesson_steps::kind,
                lesson_steps::tutor_text,
                lesson_steps::expected_text,
                lesson_steps::mastery_gain,
                lesson_steps::correction_said,
                lesson_steps::correction_corrected,
                lesson_steps::correction_explanation,
                lesson_steps::correction_pt,
                lesson_steps::correction_mistake_part,
                lesson_steps::correction_subject,
                lesson_steps::correction_verb,
                lesson_steps::correction_complement,
            ))
            .load::<(
                Uuid,
                String,
                String,
                Option<String>,
                Option<f64>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
            )>(conn)?
            .into_iter()
            .map(
                |(
                    id,
                    kind,
                    tutor,
                    expected,
                    mastery_gain,
                    said,
                    corrected,
                    explanation,
                    pt,
                    mistake_part,
                    subject,
                    verb,
                    complement,
                )| LessonStepJson {
                    id,
                    kind,
                    tutor,
                    expected,
                    mastery_gain,
                    correction: match (said, corrected, explanation, pt, mistake_part, subject, verb, complement) {
                        (Some(said), Some(corrected), Some(explanation), pt, mistake_part, subject, verb, complement) => {
                            Some(LessonCorrectionJson {
                                said,
                                corrected,
                                explanation,
                                pt: pt.unwrap_or_default(),
                                mistake_part: mistake_part.unwrap_or_default(),
                                subject: subject.unwrap_or_default(),
                                verb: verb.unwrap_or_default(),
                                complement: complement.unwrap_or_default(),
                            })
                        }
                        _ => None,
                    },
                },
            )
            .collect())
    })
    .await?;

    Ok(Json(LessonJson { planet_id, steps }))
}

#[derive(Deserialize)]
pub struct ProgressBump {
    pub metric: String,
    pub delta: f64,
}

/// Bumps one progress metric for the current planet (clamped to 0..1) and
/// returns the updated planet summary (so the client can refresh unlock state).
async fn bump_progress(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
    Json(body): Json<ProgressBump>,
) -> Result<Json<PlanetSummary>, AppError> {
    if !METRICS.contains(&body.metric.as_str()) {
        return Err(AppError::bad_request(format!(
            "unknown metric '{}'; expected one of {METRICS:?}",
            body.metric
        )));
    }
    if !body.delta.is_finite() || body.delta.abs() > 1.0 {
        return Err(AppError::bad_request(
            "delta must be a finite number between -1 and 1",
        ));
    }

    run_db(&state.pool, move |conn| {
        let current = user_planet_progress::table
            .find((user_id, planet_id))
            .first::<PlanetProgress>(conn)
            .optional()?
            .unwrap_or_else(|| PlanetProgress::empty(planet_id));

        // Compute the post-bump value for every metric (only one changes).
        let next = (current.metric(&body.metric) + body.delta).clamp(0.0, 1.0);
        let (n_s, n_pr, n_c, n_l, n_f, n_r, n_m) = match body.metric.as_str() {
            "sentences" => (next, current.pronunciation, current.conversation, current.listening, current.flashcards, current.review, current.mastery),
            "pronunciation" => (current.sentences, next, current.conversation, current.listening, current.flashcards, current.review, current.mastery),
            "conversation" => (current.sentences, current.pronunciation, next, current.listening, current.flashcards, current.review, current.mastery),
            "listening" => (current.sentences, current.pronunciation, current.conversation, next, current.flashcards, current.review, current.mastery),
            "flashcards" => (current.sentences, current.pronunciation, current.conversation, current.listening, next, current.review, current.mastery),
            "review" => (current.sentences, current.pronunciation, current.conversation, current.listening, current.flashcards, next, current.mastery),
            _ => (current.sentences, current.pronunciation, current.conversation, current.listening, current.flashcards, current.review, next),
        };

        // Upsert the progress row (all columns, so the conflict update is type-safe).
        diesel::insert_into(user_planet_progress::table)
            .values((
                user_planet_progress::user_id.eq(user_id),
                user_planet_progress::planet_id.eq(planet_id),
                user_planet_progress::sentences.eq(n_s),
                user_planet_progress::pronunciation.eq(n_pr),
                user_planet_progress::conversation.eq(n_c),
                user_planet_progress::listening.eq(n_l),
                user_planet_progress::flashcards.eq(n_f),
                user_planet_progress::review.eq(n_r),
                user_planet_progress::mastery.eq(n_m),
            ))
            .on_conflict((user_planet_progress::user_id, user_planet_progress::planet_id))
            .do_update()
            .set((
                user_planet_progress::sentences.eq(n_s),
                user_planet_progress::pronunciation.eq(n_pr),
                user_planet_progress::conversation.eq(n_c),
                user_planet_progress::listening.eq(n_l),
                user_planet_progress::flashcards.eq(n_f),
                user_planet_progress::review.eq(n_r),
                user_planet_progress::mastery.eq(n_m),
            ))
            .execute(conn)?;
        Ok(())
    })
    .await?;

    // Recompute the full summary so unlock status reflects the new mastery.
    let planet: Planet = run_db(&state.pool, move |conn| {
        Ok(planets::table.find(planet_id).first(conn)?)
    })
    .await?;

    let progress = load_progress(&state.pool, user_id, planet.id).await?;
    let mastered = mastered_sentence_count(&state.pool, user_id, planet.id).await?;

    // Build prev for status
    let all: Vec<Planet> = run_db(&state.pool, move |conn| {
        Ok(planets::table.order(planets::number.asc()).load(conn)?)
    })
    .await?;
    let idx = all.iter().position(|p| p.id == planet.id).unwrap_or(0);
    let prev = if idx > 0 { all.get(idx - 1) } else { None };
    let prev_info = match prev {
        Some(p) => {
            let pp = load_progress(&state.pool, user_id, p.id).await?;
            Some((pp.mastery, p.unlock_mastery))
        }
        None => None,
    };
    let (status, unlock) = status_for(progress.mastery, planet.unlock_mastery, prev_info);

    let total: i64 = run_db(&state.pool, move |conn| {
        Ok(planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet.id))
            .count()
            .get_result(conn)?)
    })
    .await?;

    Ok(Json(PlanetSummary {
        id: planet.id,
        number: planet.number,
        title: planet.title,
        subtitle: planet.subtitle,
        color: planet.color,
        topics: planet.topics,
        created_at: planet.created_at,
        status,
        unlock_progress: unlock,
        mastered_sentences: mastered,
        total_sentences: total,
        progress: ProgressJson::from(&progress),
    }))
}

#[derive(Deserialize)]
pub struct SentenceMaster {
    pub mastered: bool,
}

/// Marks a sentence mastered / not mastered; the planet's "sentences" metric
/// becomes mastered/total.
async fn master_sentence(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((planet_id, sentence_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SentenceMaster>,
) -> Result<Json<serde_json::Value>, AppError> {
    run_db(&state.pool, move |conn| {
        // The sentence must exist and belong to the given planet.
        let belongs: i64 = planet_sentences::table
            .filter(planet_sentences::id.eq(sentence_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;
        if belongs == 0 {
            return Err(AppError::NotFound("sentence not found in this planet".into()));
        }

        diesel::insert_into(user_sentence_progress::table)
            .values((
                user_sentence_progress::user_id.eq(user_id),
                user_sentence_progress::sentence_id.eq(sentence_id),
                user_sentence_progress::mastered.eq(body.mastered),
            ))
            .on_conflict((user_sentence_progress::user_id, user_sentence_progress::sentence_id))
            .do_update()
            .set(user_sentence_progress::mastered.eq(body.mastered))
            .execute(conn)?;

        let mastered: i64 = user_sentence_progress::table
            .inner_join(planet_sentences::table.on(planet_sentences::id.eq(user_sentence_progress::sentence_id)))
            .filter(user_sentence_progress::user_id.eq(user_id))
            .filter(planet_sentences::planet_id.eq(planet_id))
            .filter(user_sentence_progress::mastered.eq(true))
            .count()
            .get_result(conn)?;
        let total: i64 = planet_sentences::table
            .filter(planet_sentences::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;

        let sentences_metric = if total > 0 { mastered as f64 / total as f64 } else { 0.0 };

        // Reflect the mastered-sentences ratio in the progress row.
        diesel::insert_into(user_planet_progress::table)
            .values((
                user_planet_progress::user_id.eq(user_id),
                user_planet_progress::planet_id.eq(planet_id),
                user_planet_progress::sentences.eq(sentences_metric),
            ))
            .on_conflict((user_planet_progress::user_id, user_planet_progress::planet_id))
            .do_update()
            .set(user_planet_progress::sentences.eq(sentences_metric))
            .execute(conn)?;

        Ok(serde_json::json!({
            "sentence_id": sentence_id,
            "mastered": body.mastered,
            "mastered_sentences": mastered,
            "total_sentences": total,
            "progress": { "sentences": sentences_metric },
        }))
    })
    .await
    .map(Json)
}
