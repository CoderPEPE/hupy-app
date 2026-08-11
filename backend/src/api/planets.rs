//! Planet endpoints: catalog, list, detail, scripted lesson, progress bumps
//! and sentence mastery. Business rules live in [`crate::services::planets`];
//! handlers here only validate input, assemble DTOs and orchestrate.

use crate::errors::{AppError, Result};
use crate::middleware::auth::AuthUser;
use crate::models::{LessonStep, Planet, PlanetProgress, Sentence};
use crate::repositories;
use crate::services;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_planets))
        // Unauthenticated: how much content the course actually contains, so
        // the pre-login screens can state real figures instead of marketing
        // claims. Counts only — no user data is exposed here.
        .route("/catalog", get(catalog_stats))
        .route("/{id}", get(planet_detail))
        .route("/{id}/lesson", get(planet_lesson))
        .route("/{id}/progress", axum::routing::post(bump_progress))
        .route(
            "/{id}/sentences/{sentence_id}/master",
            axum::routing::post(master_sentence),
        )
}

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
    /// The course this planet belongs to: 'en' | 'es' | 'pt'. The client uses
    /// it to label the target/base languages (audio modes, TTS voice).
    pub language: String,
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

/// Real counts of what the course contains. Public (no auth) so the
/// pre-login screens can quote actual figures rather than invented ones.
#[derive(Debug, Serialize)]
pub struct CatalogStats {
    pub planets: i64,
    pub sentences: i64,
    pub lessons: i64,
}

#[derive(Deserialize)]
pub struct CatalogQuery {
    /// Course to count ('en' | 'es' | 'pt'); defaults to 'en'.
    pub language: Option<String>,
}

#[derive(Deserialize)]
pub struct ProgressBump {
    pub metric: String,
    pub delta: f64,
}

#[derive(Deserialize)]
pub struct SentenceMaster {
    pub mastered: bool,
}

// ---------------------------------------------------------------------------
// Shared summary assembly
// ---------------------------------------------------------------------------

/// Recomputes the full planet summary for one user — unlock status, progress,
/// sentence counts — so any handler that changed progress can return a
/// refreshed picture. Used by `bump_progress`; the list/detail endpoints
/// assemble their own batch versions.
async fn build_summary(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    planet: &Planet,
) -> Result<PlanetSummary> {
    let progress = repositories::planets::load_progress(pool, user_id, planet.id).await?;
    let mastered = repositories::planets::mastered_sentence_count(pool, user_id, planet.id).await?;
    let total = repositories::planets::sentence_count(pool, planet.id).await?;

    let prev =
        repositories::planets::previous_planet(pool, planet.number, &planet.language).await?;
    let prev_info = match prev {
        Some(p) => {
            let pp = repositories::planets::load_progress(pool, user_id, p.id).await?;
            Some((pp.mastery, p.unlock_mastery))
        }
        None => None,
    };
    let (status, unlock) =
        services::planets::status_for(progress.mastery, planet.unlock_mastery, prev_info);

    Ok(PlanetSummary {
        id: planet.id,
        number: planet.number,
        title: planet.title.clone(),
        subtitle: planet.subtitle.clone(),
        color: planet.color.clone(),
        topics: planet.topics.clone(),
        created_at: planet.created_at,
        language: planet.language.clone(),
        status,
        unlock_progress: unlock,
        mastered_sentences: mastered,
        total_sentences: total,
        progress: ProgressJson::from(&progress),
    })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn catalog_stats(
    State(state): State<AppState>,
    Query(q): Query<CatalogQuery>,
) -> Result<Json<CatalogStats>> {
    let language = q
        .language
        .as_deref()
        .filter(|l| matches!(*l, "en" | "es" | "pt"))
        .unwrap_or("en");
    let (planets, sentences, lessons) =
        repositories::planets::catalog_counts(&state.pool, language).await?;
    Ok(Json(CatalogStats {
        planets,
        sentences,
        lessons,
    }))
}

async fn list_planets(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<Vec<PlanetSummary>>> {
    // The user's course decides which of the three parallel planet sets they
    // see — the same Mercury..Neptune path exists in English, Spanish and
    // Portuguese, so filtering here keeps progress chains inside one course.
    let language = repositories::users::find_by_id(&state.pool, user_id)
        .await?
        .map(|u| u.language)
        .unwrap_or_else(|| "en".into());
    let all = repositories::planets::list_for_language(&state.pool, &language).await?;

    // All progress rows for this user, keyed by planet id.
    let rows = repositories::planets::all_progress_for(&state.pool, user_id).await?;
    let mut by_planet: std::collections::HashMap<Uuid, PlanetProgress> =
        rows.into_iter().map(|r| (r.planet_id, r)).collect();

    // Total sentence counts per planet.
    let totals: std::collections::HashMap<Uuid, i64> =
        repositories::planets::sentence_totals_by_planet(&state.pool)
            .await?
            .into_iter()
            .collect();

    // Mastered counts per planet.
    let mastered_map: std::collections::HashMap<Uuid, i64> =
        repositories::planets::mastered_counts_by_planet(&state.pool, user_id)
            .await?
            .into_iter()
            .collect();

    let mut out = Vec::with_capacity(all.len());
    let mut prev: Option<(f64, f64)> = None;
    for p in &all {
        let prog = by_planet
            .remove(&p.id)
            .unwrap_or_else(|| PlanetProgress::empty(p.id));
        let (status, unlock) = services::planets::status_for(prog.mastery, p.unlock_mastery, prev);
        out.push(PlanetSummary {
            id: p.id,
            number: p.number,
            title: p.title.clone(),
            subtitle: p.subtitle.clone(),
            color: p.color.clone(),
            topics: p.topics.clone(),
            created_at: p.created_at,
            language: p.language.clone(),
            status,
            unlock_progress: unlock,
            mastered_sentences: mastered_map.get(&p.id).copied().unwrap_or(0),
            total_sentences: totals.get(&p.id).copied().unwrap_or(0),
            progress: ProgressJson::from(&prog),
        });
        prev = Some((prog.mastery, p.unlock_mastery));
    }

    Ok(Json(out))
}

async fn planet_detail(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<PlanetDetail>> {
    let planet = repositories::planets::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("planet not found"))?;

    let progress = repositories::planets::load_progress(&state.pool, user_id, planet_id).await?;

    let prev =
        repositories::planets::previous_planet(&state.pool, planet.number, &planet.language)
            .await?;
    let prev_progress = match &prev {
        Some(p) => Some(repositories::planets::load_progress(&state.pool, user_id, p.id).await?),
        None => None,
    };
    let prev_info = prev
        .zip(prev_progress.as_ref())
        .map(|(p, pp)| (pp.mastery, p.unlock_mastery));
    let (status, unlock) =
        services::planets::status_for(progress.mastery, planet.unlock_mastery, prev_info);

    let total = repositories::planets::sentence_count(&state.pool, planet_id).await?;
    let mastered =
        repositories::planets::mastered_sentence_count(&state.pool, user_id, planet_id).await?;

    // Mastered sentence ids for this user+planet (single query, no N+1).
    let mastered_ids =
        repositories::planets::mastered_sentence_ids(&state.pool, user_id, planet_id).await?;
    let mastered_set: std::collections::HashSet<Uuid> = mastered_ids.into_iter().collect();

    // Each sentence row stores the text for all three languages; expose the
    // pair that matters for this course (target in `en`, base in `pt`).
    let sentences: Vec<SentenceJson> = repositories::planets::sentences_for(&state.pool, planet_id)
        .await?
        .into_iter()
        .map(|s: Sentence| {
            let (en, pt) =
                crate::models::planet::sentence_texts(&s, &planet.language);
            SentenceJson {
                id: s.id,
                position: s.position,
                en,
                pt,
                subject: s.subject,
                verb: s.verb,
                complement: s.complement,
                mastered: mastered_set.contains(&s.id),
            }
        })
        .collect();

    // Lesson path: Learn -> Practice -> Test -> Master, with per-user
    // completion derived from mastery, and each lesson locked until the
    // previous one is completed.
    let rows = repositories::planets::lesson_rows(&state.pool, planet_id).await?;
    let mut prev_completed = true;
    let lessons = rows
        .into_iter()
        .map(|(id, position, kind, title, description)| {
            let completed = services::planets::lesson_completed(&kind, progress.mastery);
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
        language: planet.language,
        status,
        unlock_progress: unlock,
        mastered_sentences: mastered,
        total_sentences: total,
        progress: ProgressJson::from(&progress),
    };

    Ok(Json(PlanetDetail {
        summary,
        sentences,
        lessons,
    }))
}

/// Returns the scripted pedagogical lesson for a planet (the Huppy cycle:
/// teach -> repeat -> question -> correction -> review -> praise).
async fn planet_lesson(
    State(state): State<AppState>,
    AuthUser(_user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
) -> Result<Json<LessonJson>> {
    let exists = repositories::planets::find(&state.pool, planet_id).await?;
    if exists.is_none() {
        return Err(AppError::not_found("planet not found"));
    }

    let steps: Vec<LessonStepJson> =
        repositories::planets::lesson_steps_for(&state.pool, planet_id)
            .await?
            .into_iter()
            .map(|s: LessonStep| LessonStepJson {
                id: s.id,
                kind: s.kind,
                tutor: s.tutor_text,
                expected: s.expected_text,
                mastery_gain: s.mastery_gain,
                correction: match (
                    s.correction_said,
                    s.correction_corrected,
                    s.correction_explanation,
                    s.correction_pt,
                    s.correction_mistake_part,
                    s.correction_subject,
                    s.correction_verb,
                    s.correction_complement,
                ) {
                    (
                        Some(said),
                        Some(corrected),
                        Some(explanation),
                        pt,
                        mistake_part,
                        subject,
                        verb,
                        complement,
                    ) => Some(LessonCorrectionJson {
                        said,
                        corrected,
                        explanation,
                        pt: pt.unwrap_or_default(),
                        mistake_part: mistake_part.unwrap_or_default(),
                        subject: subject.unwrap_or_default(),
                        verb: verb.unwrap_or_default(),
                        complement: complement.unwrap_or_default(),
                    }),
                    _ => None,
                },
            })
            .collect();

    Ok(Json(LessonJson { planet_id, steps }))
}

/// Bumps one progress metric for the current planet (clamped to 0..1),
/// recomputes `mastery` as the average of all 6 sub-metrics, and returns the
/// updated planet summary (so the client can refresh unlock state).
///
/// Only the AI's qualitative judgment metrics are bumpable here —
/// `sentences` and `flashcards` are derived from real counts elsewhere
/// (`master_sentence`, flashcard review), and `mastery` is never set
/// directly; it's always the computed average.
async fn bump_progress(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(planet_id): Path<Uuid>,
    Json(body): Json<ProgressBump>,
) -> Result<Json<PlanetSummary>> {
    if !services::planets::BUMPABLE_METRICS.contains(&body.metric.as_str()) {
        return Err(AppError::bad_request(format!(
            "unknown metric '{}'; expected one of {:?}",
            body.metric,
            services::planets::BUMPABLE_METRICS
        )));
    }
    if !body.delta.is_finite() || body.delta.abs() > 1.0 {
        return Err(AppError::bad_request(
            "delta must be a finite number between -1 and 1",
        ));
    }

    services::planets::bump_metric_delta(&state.pool, user_id, planet_id, &body.metric, body.delta)
        .await?;
    if body.delta > 0.0 {
        services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 1).await;
    }

    // Recompute the full summary so unlock status reflects the new mastery.
    let planet = repositories::planets::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("planet not found"))?;
    let summary = build_summary(&state.pool, user_id, &planet).await?;

    Ok(Json(summary))
}

/// Marks a sentence mastered / not mastered; the planet's "sentences" metric
/// becomes mastered/total.
async fn master_sentence(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((planet_id, sentence_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SentenceMaster>,
) -> Result<Json<Value>> {
    let (mastered, total) = repositories::planets::mark_sentence_mastered(
        &state.pool,
        user_id,
        planet_id,
        sentence_id,
        body.mastered,
    )
    .await?;
    let sentences_metric = services::planets::sentences_progress(mastered, total);
    services::planets::set_metric_absolute(
        &state.pool,
        user_id,
        planet_id,
        "sentences",
        sentences_metric,
    )
    .await?;

    if body.mastered {
        services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 8).await;
    }

    Ok(Json(serde_json::json!({
        "sentence_id": sentence_id,
        "mastered": body.mastered,
        "mastered_sentences": mastered,
        "total_sentences": total,
        "progress": { "sentences": sentences_metric },
    })))
}
