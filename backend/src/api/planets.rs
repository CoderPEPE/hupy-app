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
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn router(state: AppState) -> Router<AppState> {
    // Per-IP anti-abuse cap on the two mutating routes (progress bumps,
    // sentence mastery), sharing one budget with conversations/flashcards
    // writes. The read paths — including the public /catalog — stay
    // unlimited.
    let write = middleware::from_fn_with_state(
        state.clone(),
        crate::middleware::ratelimit::write_ratelimit,
    );
    Router::new()
        .route("/", get(list_planets))
        // Unauthenticated: how much content the course actually contains, so
        // the pre-login screens can state real figures instead of marketing
        // claims. Counts only — no user data is exposed here.
        .route("/catalog", get(catalog_stats))
        .route("/{id}", get(planet_detail))
        .route("/{id}/lesson", get(planet_lesson))
        .route("/{id}/progress", post(bump_progress).layer(write.clone()))
        .route(
            "/{id}/sentences/{sentence_id}/master",
            post(master_sentence).layer(write),
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
    /// The explanation language of this course ('en' | 'es' | 'pt').
    pub base_language: String,
    /// The taught (target) language: 'en' | 'es' | 'pt'. The client uses the
    /// pair to label target/base languages (audio modes, TTS voice).
    pub language: String,
    /// The spec's six states: "locked" | "available" | "in_progress" |
    /// "review" | "conquered" | "mastered".
    pub status: String,
    /// 0..1 — how close this planet is to being unlocked (previous planet mastery).
    pub unlock_progress: f64,
    pub mastered_sentences: i64,
    pub total_sentences: i64,
    /// CEFR band of the planet ('A1' … 'C1').
    pub level: String,
    /// The planet's communication goal.
    pub goal: String,
    /// Blocks completed so far (0..=10) — derived from mastery.
    pub completed_blocks: i64,
    /// Total blocks on the planet (10).
    pub total_blocks: i64,
    /// Essential skills currently below 60% — what a pending review targets.
    /// Empty for a planet with nothing to revisit.
    pub review_skills: Vec<String>,
    pub progress: ProgressJson,
}

/// Assembles the state-dependent half of a summary once, so the list and
/// detail endpoints can never drift apart on what a state means.
fn summary_fields(
    progress: &PlanetProgress,
    completed_modules: i64,
    prev_completed_modules: Option<i64>,
) -> (String, f64, Vec<String>) {
    let (status, unlock) =
        services::planets::state_for(progress, completed_modules, prev_completed_modules);
    let review_skills = services::planets::pending_review_skills(progress)
        .into_iter()
        .map(String::from)
        .collect();
    (status, unlock, review_skills)
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

/// One chunk a module teaches: the target-language phrase and its translation,
/// plus how far the learner has drilled it in the current conversation.
#[derive(Serialize)]
pub struct StructureJson {
    pub target: String,
    pub base: String,
    /// How many times the learner has produced this structure correctly — the
    /// per-module checkpoint that survives app restarts.
    pub productions: i64,
    /// True once `productions` reaches the module's requirement (3).
    pub done: bool,
}

/// One module of the planet's ten-module path, with its per-user state.
#[derive(Serialize)]
pub struct PlanetLessonJson {
    pub id: Uuid,
    pub position: i32,
    pub kind: String,
    pub title: String,
    pub description: String,
    /// What this module drills: `verb:have`, `mix`, `past`, `questions`, …
    pub focus: String,
    /// The chunks taught here, target-language first.
    pub structures: Vec<StructureJson>,
    /// Cards this module's conversation produced, and how many are cleared —
    /// the second half of the gate on the next module.
    pub flashcards_total: i64,
    pub flashcards_reviewed: i64,
    /// The spec's six block states: "locked" | "available" | "in_progress" |
    /// "completed" | "review" | "mastered".
    pub state: String,
    /// The progress metric this block trains — what its review would drill.
    pub skill: String,
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
    /// Target language to count ('en' | 'es' | 'pt'); defaults to 'en'.
    pub language: Option<String>,
    /// Base language of the course; defaults to the conventional base for the target.
    pub base_language: Option<String>,
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
    let completed_all = repositories::modules::completed_counts_by_planet(pool, user_id).await?;
    let completed_modules = completed_all.get(&planet.id).copied().unwrap_or(0);
    let progress = repositories::planets::load_progress(pool, user_id, planet.id).await?;
    let mastered = repositories::planets::mastered_sentence_count(pool, user_id, planet.id).await?;
    let total = repositories::planets::sentence_count(pool, planet.id).await?;

    let prev = repositories::planets::previous_planet(
        pool,
        planet.number,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    let (status, unlock, review_skills) = summary_fields(
        &progress,
        completed_modules,
        prev.map(|p| completed_all.get(&p.id).copied().unwrap_or(0)),
    );

    Ok(PlanetSummary {
        id: planet.id,
        number: planet.number,
        title: planet.title.clone(),
        subtitle: planet.subtitle.clone(),
        color: planet.color.clone(),
        topics: planet.topics.clone(),
        created_at: planet.created_at,
        base_language: planet.base_language.clone(),
        language: planet.language.clone(),
        status,
        unlock_progress: unlock,
        mastered_sentences: mastered,
        total_sentences: total,
        level: planet.level.clone(),
        goal: planet.goal.clone(),
        completed_blocks: completed_modules,
        total_blocks: services::planets::TOTAL_BLOCKS,
        review_skills,
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
        .unwrap_or("en")
        .to_string();
    let base_language = q
        .base_language
        .as_deref()
        .filter(|l| matches!(*l, "en" | "es" | "pt"))
        .unwrap_or_else(|| crate::models::planet::default_base_for(&language));
    let (planets, sentences, lessons) =
        repositories::planets::catalog_counts(&state.pool, base_language, &language).await?;
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
    // The user's course pair decides which of the six parallel planet sets
    // they see — the same Mercury..Neptune path exists for every base→target
    // pair, so filtering here keeps progress chains inside one course.
    let (base_language, language) = repositories::users::find_by_id(&state.pool, user_id)
        .await?
        .map(|u| (u.base_language, u.language))
        .unwrap_or_else(|| ("pt".into(), "en".into()));
    let all =
        repositories::planets::list_for_course(&state.pool, &base_language, &language).await?;

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

    // Finished modules per planet: what unlocks the next planet now.
    let completed_modules =
        repositories::modules::completed_counts_by_planet(&state.pool, user_id).await?;

    let mut out = Vec::with_capacity(all.len());
    let mut prev_done: Option<i64> = None;
    for p in &all {
        let prog = by_planet
            .remove(&p.id)
            .unwrap_or_else(|| PlanetProgress::empty(p.id));
        let done = completed_modules.get(&p.id).copied().unwrap_or(0);
        let (status, unlock, review_skills) = summary_fields(&prog, done, prev_done);
        out.push(PlanetSummary {
            id: p.id,
            number: p.number,
            title: p.title.clone(),
            subtitle: p.subtitle.clone(),
            color: p.color.clone(),
            topics: p.topics.clone(),
            created_at: p.created_at,
            base_language: p.base_language.clone(),
            language: p.language.clone(),
            status,
            unlock_progress: unlock,
            mastered_sentences: mastered_map.get(&p.id).copied().unwrap_or(0),
            total_sentences: totals.get(&p.id).copied().unwrap_or(0),
            level: p.level.clone(),
            goal: p.goal.clone(),
            completed_blocks: done,
            total_blocks: services::planets::TOTAL_BLOCKS,
            review_skills,
            progress: ProgressJson::from(&prog),
        });
        prev_done = Some(done);
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

    let prev = repositories::planets::previous_planet(
        &state.pool,
        planet.number,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    let completed_all =
        repositories::modules::completed_counts_by_planet(&state.pool, user_id).await?;
    let (status, unlock, review_skills) = summary_fields(
        &progress,
        completed_all.get(&planet_id).copied().unwrap_or(0),
        prev.as_ref()
            .map(|p| completed_all.get(&p.id).copied().unwrap_or(0)),
    );

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
                crate::models::planet::sentence_texts(&s, &planet.language, &planet.base_language);
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

    // The ten-module path. State is the real learning cycle now — conversation
    // then flashcards, strictly in order — not a reading of the mastery
    // average, so a module only opens once the one before it is truly done.
    let modules = repositories::modules::lessons_for(&state.pool, planet_id).await?;
    let module_progress =
        repositories::modules::progress_for_planet(&state.pool, user_id, planet_id).await?;
    let states = services::curriculum::module_states(&modules, &module_progress);
    // The per-structure drill checkpoints for every module at once (one
    // query, no N+1) — what the chat's progress bar is drawn from.
    let structure_progress =
        repositories::modules::structure_progress_for_planet(&state.pool, user_id, planet_id)
            .await?;
    let mut lessons = Vec::with_capacity(modules.len());
    for (module, module_state) in modules.iter().zip(&states) {
        // Only the reachable modules need their card counts: a locked module
        // has no cards yet, and querying all ten would be ten round trips for
        // numbers nobody reads.
        let (flashcards_total, flashcards_reviewed) =
            if *module_state == services::curriculum::ModuleState::Locked {
                (0, 0)
            } else {
                repositories::modules::flashcard_counts(&state.pool, user_id, module.id).await?
            };
        lessons.push(PlanetLessonJson {
            id: module.id,
            position: module.position,
            skill: services::planets::block_skill(&module.kind).to_string(),
            kind: module.kind.clone(),
            title: module.title.clone(),
            description: module.description.clone(),
            focus: module.focus.clone(),
            structures: services::curriculum::structures(&module.structures)
                .into_iter()
                .map(|s| {
                    let p = structure_progress
                        .get(&(module.id, s.target.clone()))
                        .copied()
                        .unwrap_or(0);
                    StructureJson {
                        target: s.target,
                        base: s.base,
                        productions: i64::from(p),
                        done: p >= services::curriculum::REQUIRED_PRODUCTIONS as i32,
                    }
                })
                .collect(),
            flashcards_total,
            flashcards_reviewed,
            state: module_state.as_str().to_string(),
        });
    }

    let summary = PlanetSummary {
        id: planet.id,
        number: planet.number,
        title: planet.title,
        subtitle: planet.subtitle,
        color: planet.color,
        topics: planet.topics,
        created_at: planet.created_at,
        base_language: planet.base_language,
        language: planet.language,
        status,
        unlock_progress: unlock,
        mastered_sentences: mastered,
        total_sentences: total,
        level: planet.level,
        goal: planet.goal,
        completed_blocks: services::curriculum::completed_count(&modules, &module_progress),
        total_blocks: services::planets::TOTAL_BLOCKS,
        review_skills,
        progress: ProgressJson::from(&progress),
    };

    Ok(Json(PlanetDetail {
        summary,
        sentences,
        lessons,
    }))
}

/// Returns the scripted pedagogical lesson for a planet (the hupy cycle:
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
    // A clean 404 before any validation or write: a missing planet must not
    // surface as a database foreign-key 500, and its absence shouldn't be
    // inferable from which other errors come back first.
    let planet = repositories::planets::find(&state.pool, planet_id)
        .await?
        .ok_or_else(|| AppError::not_found("planet not found"))?;

    if !services::planets::BUMPABLE_METRICS.contains(&body.metric.as_str()) {
        return Err(AppError::bad_request(format!(
            "unknown metric '{}'; expected one of {:?}",
            body.metric,
            services::planets::BUMPABLE_METRICS
        )));
    }
    if !body.delta.is_finite() {
        return Err(AppError::bad_request("delta must be a finite number"));
    }
    // One call may only move a metric by the amount the tutor grades a single
    // turn at — larger deltas are the old instant-unlock cheat vector.
    if body.delta.abs() > services::planets::MAX_BUMP_DELTA {
        return Err(AppError::bad_request(format!(
            "delta must be between -{} and {} (tutor-graded adjustments only)",
            services::planets::MAX_BUMP_DELTA,
            services::planets::MAX_BUMP_DELTA
        )));
    }

    services::planets::bump_metric_delta(&state.pool, user_id, planet_id, &body.metric, body.delta)
        .await?;
    if body.delta > 0.0 {
        services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 1).await;
    }

    // Recompute the full summary so unlock status reflects the new mastery.
    let summary = build_summary(&state.pool, user_id, &planet).await?;

    Ok(Json(summary))
}

/// Marks a sentence mastered / not mastered; the planet's "sentences" metric
/// becomes mastered/total. XP is awarded only on a *new* mastery — repeating
/// "master" on an already-mastered sentence must not farm XP.
async fn master_sentence(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((planet_id, sentence_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SentenceMaster>,
) -> Result<Json<Value>> {
    let (mastered, total, newly_mastered) = repositories::planets::mark_sentence_mastered(
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

    if newly_mastered {
        services::gamification::touch_activity_and_award_xp(&state.pool, user_id, 8).await;
        // Fallback path: a planet whose current module has no authored chunks
        // teaches from its sentence list, so mastering every sentence is that
        // module's completion condition (the authored path closes via
        // `record_production` instead). Closing here keeps those modules from
        // looping over the same sentences forever too.
        let modules = repositories::modules::lessons_for(&state.pool, planet_id).await?;
        let module_progress =
            repositories::modules::progress_for_planet(&state.pool, user_id, planet_id).await?;
        if let Some(current) = services::curriculum::current_module(&modules, &module_progress) {
            if services::curriculum::structures(&current.structures).is_empty() && mastered >= total
            {
                repositories::modules::complete_conversation(
                    &state.pool,
                    user_id,
                    current.id,
                    serde_json::json!([]),
                )
                .await?;
                // Closing only the conversation half strands the module: a
                // sentence-taught module mints no corrections, so its deck is
                // empty and the flashcard half can never close on its own.
                // Mirror the authored path in api/modules.rs.
                let (total_cards, reviewed_cards) =
                    repositories::modules::flashcard_counts(&state.pool, user_id, current.id)
                        .await?;
                if total_cards == 0 || reviewed_cards >= total_cards {
                    repositories::modules::set_flashcards_done(
                        &state.pool,
                        user_id,
                        current.id,
                        true,
                    )
                    .await?;
                }
            }
        }
    }

    Ok(Json(serde_json::json!({
        "sentence_id": sentence_id,
        "mastered": body.mastered,
        "mastered_sentences": mastered,
        "total_sentences": total,
        "progress": { "sentences": sentences_metric },
    })))
}
