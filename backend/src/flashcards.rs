use crate::auth::AuthUser;
use crate::db::run_db;
use crate::errors::AppError;
use crate::schema::{card_reviews, conversations, corrections, flashcards};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_flashcards).post(create_flashcard))
        .route("/{id}", axum::routing::delete(delete_flashcard))
        .route("/{id}/review", axum::routing::post(review_flashcard))
        .route("/{id}/confirm-live-mastery", axum::routing::post(confirm_live_mastery))
        .route("/corrections/{correction_id}/flashcard", axum::routing::post(correction_to_card))
}

// ---------------------------------------------------------------------------

/// First-review intervals match the app's constants (hard=1, medium=3, easy=7).
/// Later reviews: easy/medium grow the interval with an SM-2-style ease factor,
/// while "hard" items are brought back sooner (the spec: difficult content
/// must appear more frequently).
fn schedule(rating: &str, interval_days: i32, ease: f64, repetitions: i32) -> (i32, f64, i32) {
    let (interval, new_ease) = match rating {
        "hard" => (
            if interval_days == 0 {
                1
            } else {
                (((interval_days as f64) * 0.5).round() as i32).max(1)
            },
            ease - 0.15,
        ),
        "medium" => (
            if interval_days == 0 {
                3
            } else {
                ((interval_days as f64) * ease).round() as i32
            },
            ease,
        ),
        "easy" => (
            if interval_days == 0 {
                7
            } else {
                ((interval_days as f64) * ease * 1.3).round() as i32
            },
            ease + 0.15,
        ),
        _ => return (interval_days, ease, repetitions),
    };
    (interval.clamp(1, 90), new_ease.clamp(1.3, 3.0), repetitions + 1)
}

// ---------------------------------------------------------------------------

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = flashcards)]
struct Card {
    id: Uuid,
    user_id: Uuid,
    planet_id: Option<Uuid>,
    correction_id: Option<Uuid>,
    en: String,
    pt: String,
    explanation: String,
    subject: String,
    verb: String,
    complement: String,
    source: String,
    interval_days: i32,
    ease: f64,
    repetitions: i32,
    next_review_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
    verified_live: bool,
}

#[derive(Serialize)]
pub struct CardJson {
    pub id: Uuid,
    pub en: String,
    pub pt: String,
    pub explanation: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub planet_id: Option<Uuid>,
    pub correction_id: Option<Uuid>,
    pub source: String,
    pub interval_days: i32,
    pub ease: f64,
    pub repetitions: i32,
    pub next_review_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    /// true when the card is due for review right now
    pub due: bool,
    /// most recent rating, if any
    pub last_rating: Option<String>,
    /// false when the card was rated "easy" but the tutor hasn't re-tested it
    /// live yet — a self-report alone never counts as mastered.
    pub verified_live: bool,
}

impl CardJson {
    fn from_card(c: &Card, last_rating: Option<String>) -> Self {
        Self {
            id: c.id,
            en: c.en.clone(),
            pt: c.pt.clone(),
            explanation: c.explanation.clone(),
            subject: c.subject.clone(),
            verb: c.verb.clone(),
            complement: c.complement.clone(),
            planet_id: c.planet_id,
            correction_id: c.correction_id,
            source: c.source.clone(),
            interval_days: c.interval_days,
            ease: c.ease,
            repetitions: c.repetitions,
            next_review_at: c.next_review_at,
            created_at: c.created_at,
            due: c.next_review_at <= Utc::now(),
            last_rating,
            verified_live: c.verified_live,
        }
    }
}

/// Most recent rating per card, for the given cards.
fn latest_ratings(conn: &mut diesel::pg::PgConnection, card_ids: &[Uuid]) -> Result<std::collections::HashMap<Uuid, String>, diesel::result::Error> {
    let rows: Vec<(Uuid, String, DateTime<Utc>)> = card_reviews::table
        .filter(card_reviews::flashcard_id.eq_any(card_ids))
        .order(card_reviews::reviewed_at.asc())
        .select((card_reviews::flashcard_id, card_reviews::rating, card_reviews::reviewed_at))
        .load(conn)?;
    let mut map = std::collections::HashMap::new();
    for (id, rating, _) in rows {
        map.insert(id, rating); // last one wins
    }
    Ok(map)
}

// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CardQuery {
    pub planet_id: Option<Uuid>,
    /// when true, only cards due now are returned
    pub due: Option<bool>,
}

async fn list_flashcards(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(q): Query<CardQuery>,
) -> Result<Json<Vec<CardJson>>, AppError> {
    let out = run_db(&state.pool, move |conn| {
        let mut query = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .into_boxed();
        if let Some(pid) = q.planet_id {
            query = query.filter(flashcards::planet_id.eq(pid));
        }
        if q.due.unwrap_or(false) {
            query = query.filter(flashcards::next_review_at.le(Utc::now()));
        }
        let cards: Vec<Card> = query
            .order(flashcards::next_review_at.asc())
            .then_order_by(flashcards::created_at.desc())
            .load(conn)?;

        let ids: Vec<Uuid> = cards.iter().map(|c| c.id).collect();
        let ratings = latest_ratings(conn, &ids)?;
        Ok(cards
            .iter()
            .map(|c| CardJson::from_card(c, ratings.get(&c.id).cloned()))
            .collect::<Vec<_>>())
    })
    .await?;

    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct CreateCard {
    pub en: String,
    pub pt: String,
    pub explanation: Option<String>,
    pub subject: Option<String>,
    pub verb: Option<String>,
    pub complement: Option<String>,
    pub planet_id: Option<Uuid>,
    pub source: Option<String>,
}

async fn create_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateCard>,
) -> Result<(axum::http::StatusCode, Json<CardJson>), AppError> {
    if body.en.trim().is_empty() || body.pt.trim().is_empty() {
        return Err(AppError::bad_request("en and pt cannot be empty"));
    }
    if body.en.len() > 512 || body.pt.len() > 512 {
        return Err(AppError::bad_request("en and pt too long (max 512 chars each)"));
    }
    if body.explanation.as_deref().is_some_and(|e| e.len() > 2000) {
        return Err(AppError::bad_request("explanation too long (max 2000 chars)"));
    }
    // Structure fields map to VARCHAR columns — keep them within bounds.
    if body.subject.as_deref().is_some_and(|s| s.len() > 128)
        || body.verb.as_deref().is_some_and(|v| v.len() > 128)
        || body.complement.as_deref().is_some_and(|c| c.len() > 512)
    {
        return Err(AppError::bad_request("structure fields too long"));
    }

    let card = run_db(&state.pool, move |conn| {
        let c = diesel::insert_into(flashcards::table)
            .values((
                flashcards::user_id.eq(user_id),
                flashcards::planet_id.eq(body.planet_id),
                flashcards::en.eq(body.en),
                flashcards::pt.eq(body.pt),
                flashcards::explanation.eq(body.explanation.unwrap_or_default()),
                flashcards::subject.eq(body.subject.unwrap_or_default()),
                flashcards::verb.eq(body.verb.unwrap_or_default()),
                flashcards::complement.eq(body.complement.unwrap_or_default()),
                flashcards::source.eq(body.source.unwrap_or_else(|| "manual".into())),
            ))
            .returning(Card::as_returning())
            .get_result::<Card>(conn)?;
        Ok(CardJson::from_card(&c, None))
    })
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(card)))
}

#[derive(Deserialize)]
pub struct ReviewRequest {
    /// "hard" | "medium" | "easy"
    pub rating: String,
}

/// Records a review and reschedules the card via spaced repetition.
async fn review_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ReviewRequest>,
) -> Result<Json<CardJson>, AppError> {
    if !matches!(body.rating.as_str(), "hard" | "medium" | "easy") {
        return Err(AppError::bad_request("rating must be 'hard', 'medium' or 'easy'"));
    }

    // "easy" is a self-report — don't trust it until the tutor re-tests the
    // content live (spec: the AI must confirm mastery, not just take the
    // learner's word for it).
    let just_claimed_easy = body.rating == "easy";

    let (card, planet_id) = run_db(&state.pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("flashcard not found".into()))?;
        if card.user_id != user_id {
            return Err(AppError::NotFound("flashcard not found".into()));
        }

        let (interval, ease, repetitions) =
            schedule(&body.rating, card.interval_days, card.ease, card.repetitions);
        let next = Utc::now() + chrono::Duration::days(interval as i64);

        diesel::insert_into(card_reviews::table)
            .values((
                card_reviews::flashcard_id.eq(card.id),
                card_reviews::rating.eq(&body.rating),
            ))
            .execute(conn)?;

        diesel::update(flashcards::table.find(card.id))
            .set((
                flashcards::interval_days.eq(interval),
                flashcards::ease.eq(ease),
                flashcards::repetitions.eq(repetitions),
                flashcards::next_review_at.eq(next),
                flashcards::verified_live.eq(!just_claimed_easy && card.verified_live),
            ))
            .execute(conn)?;

        let updated = flashcards::table.find(card.id).first::<Card>(conn)?;
        Ok((CardJson::from_card(&updated, Some(body.rating)), updated.planet_id))
    })
    .await?;

    if let Some(planet_id) = planet_id {
        let metric = recompute_flashcards_metric(&state.pool, user_id, planet_id).await?;
        crate::planets::set_metric_absolute(&state.pool, user_id, planet_id, "flashcards", metric).await?;
    }

    crate::gamification::touch_activity_and_award_xp(&state.pool, user_id, 2).await;

    Ok(Json(card))
}

/// Re-confirms a flashcard the tutor has successfully quizzed live after it
/// was rated "easy" — clears the pending-reverification flag.
async fn confirm_live_mastery(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<CardJson>, AppError> {
    let (card, planet_id) = run_db(&state.pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("flashcard not found".into()))?;
        if card.user_id != user_id {
            return Err(AppError::NotFound("flashcard not found".into()));
        }

        diesel::update(flashcards::table.find(id))
            .set(flashcards::verified_live.eq(true))
            .execute(conn)?;

        let updated = flashcards::table.find(id).first::<Card>(conn)?;
        let ratings = latest_ratings(conn, &[id])?;
        Ok((CardJson::from_card(&updated, ratings.get(&id).cloned()), updated.planet_id))
    })
    .await?;

    if let Some(planet_id) = planet_id {
        let metric = recompute_flashcards_metric(&state.pool, user_id, planet_id).await?;
        crate::planets::set_metric_absolute(&state.pool, user_id, planet_id, "flashcards", metric).await?;
    }

    Ok(Json(card))
}

/// Flashcards worth quizzing in the live session right now: due for review,
/// or claiming "easy" without having been re-tested live yet.
pub(crate) async fn review_targets_for(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    limit: i64,
) -> Result<Vec<(Uuid, String, String)>, AppError> {
    run_db(pool, move |conn| {
        Ok(flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::next_review_at.le(Utc::now()).or(flashcards::verified_live.eq(false)))
            .order(flashcards::next_review_at.asc())
            .select((flashcards::id, flashcards::en, flashcards::pt))
            .limit(limit)
            .load(conn)?)
    })
    .await
}

/// Fraction of the user's flashcards for a planet that are both re-confirmed
/// live and reasonably well-scheduled (interval >= 7 days) — a real,
/// countable stand-in for "the flashcards for this planet are known".
async fn recompute_flashcards_metric(
    pool: &crate::db::DbPool,
    user_id: Uuid,
    planet_id: Uuid,
) -> Result<f64, AppError> {
    run_db(pool, move |conn| {
        let total: i64 = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::planet_id.eq(planet_id))
            .count()
            .get_result(conn)?;
        if total == 0 {
            return Ok(0.0);
        }
        let graduated: i64 = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(flashcards::planet_id.eq(planet_id))
            .filter(flashcards::verified_live.eq(true))
            .filter(flashcards::interval_days.ge(7))
            .count()
            .get_result(conn)?;
        Ok(graduated as f64 / total as f64)
    })
    .await
}

async fn delete_flashcard(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    run_db(&state.pool, move |conn| {
        let card = flashcards::table
            .find(id)
            .first::<Card>(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("flashcard not found".into()))?;
        if card.user_id != user_id {
            return Err(AppError::NotFound("flashcard not found".into()));
        }
        diesel::delete(flashcards::table.find(id)).execute(conn)?;
        Ok(())
    })
    .await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::schedule;

    #[test]
    fn first_review_intervals_match_app_constants() {
        assert_eq!(schedule("hard", 0, 2.5, 0).0, 1);
        assert_eq!(schedule("medium", 0, 2.5, 0).0, 3);
        assert_eq!(schedule("easy", 0, 2.5, 0).0, 7);
    }

    #[test]
    fn easy_grows_interval_and_ease() {
        let (interval, ease, reps) = schedule("easy", 7, 2.5, 1);
        assert_eq!(interval, 23); // 7 * 2.5 * 1.3 = 22.75 -> 23
        assert!((ease - 2.65).abs() < 1e-9);
        assert_eq!(reps, 2);
    }

    #[test]
    fn hard_shrinks_interval() {
        let (interval, ease, _) = schedule("hard", 7, 2.5, 2);
        assert_eq!(interval, 4); // 7 * 0.5 = 3.5 -> 4
        assert!((ease - 2.35).abs() < 1e-9);
    }

    #[test]
    fn intervals_and_ease_are_clamped() {
        let (interval, _, _) = schedule("easy", 200, 2.5, 3);
        assert!(interval <= 90);
        let (_, ease, _) = schedule("hard", 1, 1.0, 5);
        assert!(ease >= 1.3);
        let (_, ease, _) = schedule("easy", 1, 3.0, 5);
        assert!(ease <= 3.0);
    }
}

/// Turns a saved correction into a flashcard (the "Make a card" action).
async fn correction_to_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(correction_id): Path<Uuid>,
) -> Result<(axum::http::StatusCode, Json<CardJson>), AppError> {
    let card = run_db(&state.pool, move |conn| {
        let corr = corrections::table
            .find(correction_id)
            .first::<crate::conversations::Correction>(conn)
            .optional()?
            .ok_or_else(|| AppError::NotFound("correction not found".into()))?;
        if corr.user_id != user_id {
            return Err(AppError::NotFound("correction not found".into()));
        }

        // Inherit the planet from the conversation the correction belongs to.
        let planet_id = match corr.conversation_id {
            Some(cid) => conversations::table
                .find(cid)
                .select(conversations::planet_id)
                .first::<Option<Uuid>>(conn)
                .optional()?
                .flatten(),
            None => None,
        };

        let c = diesel::insert_into(flashcards::table)
            .values((
                flashcards::user_id.eq(user_id),
                flashcards::planet_id.eq(planet_id),
                flashcards::correction_id.eq(Some(corr.id)),
                flashcards::en.eq(corr.corrected),
                flashcards::pt.eq(corr.pt),
                flashcards::explanation.eq(corr.explanation),
                flashcards::subject.eq(corr.subject),
                flashcards::verb.eq(corr.verb),
                flashcards::complement.eq(corr.complement),
                flashcards::source.eq("correction"),
            ))
            .returning(Card::as_returning())
            .get_result::<Card>(conn)?;
        Ok(CardJson::from_card(&c, None))
    })
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(card)))
}
