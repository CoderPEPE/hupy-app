//! Flashcard persistence (cards + spaced-repetition review log).

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{Card, Correction, NewCard};
use crate::schema::{card_reviews, conversations, corrections, flashcards};
use crate::services::flashcards::Schedule;
use chrono::Utc;
use diesel::prelude::*;
use diesel::OptionalExtension;
use std::collections::HashMap;
use uuid::Uuid;

/// Cards for a user, optionally filtered by planet and/or due-now, each with
/// its most recent review rating.
pub async fn list_with_ratings(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Option<Uuid>,
    due_only: bool,
) -> Result<Vec<(Card, Option<String>)>> {
    run_db(pool, move |conn| {
        let mut query = flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .into_boxed();
        if let Some(pid) = planet_id {
            query = query.filter(flashcards::planet_id.eq(pid));
        }
        if due_only {
            query = query.filter(flashcards::next_review_at.le(Utc::now()));
        }
        let cards: Vec<Card> = query
            .order(flashcards::next_review_at.asc())
            .then_order_by(flashcards::created_at.desc())
            .load(conn)?;

        let ids: Vec<Uuid> = cards.iter().map(|c| c.id).collect();
        let ratings = latest_ratings(conn, &ids)?;
        Ok(cards
            .into_iter()
            .map(|c| {
                let rating = ratings.get(&c.id).cloned();
                (c, rating)
            })
            .collect())
    })
    .await
}

pub async fn insert(pool: &DbPool, c: &NewCard) -> Result<Card> {
    let c = c.clone();
    run_db(pool, move |conn| {
        Ok(diesel::insert_into(flashcards::table)
            .values(&c)
            .returning(Card::as_returning())
            .get_result::<Card>(conn)?)
    })
    .await
}

/// Loads a card owned by the user, or 404.
pub async fn find_owned(pool: &DbPool, user_id: Uuid, id: Uuid) -> Result<Card> {
    run_db(pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("flashcard not found"))?;
        if card.user_id != user_id {
            return Err(AppError::not_found("flashcard not found"));
        }
        Ok(card)
    })
    .await
}

/// Records a review (inserts the log row, updates the card's schedule) and
/// returns the updated card with its latest rating. The caller computes the
/// new scheduling numbers via the SRS service; this function persists them.
pub async fn record_review(
    pool: &DbPool,
    user_id: Uuid,
    id: Uuid,
    rating: &str,
    schedule: Schedule,
    verified_live: bool,
) -> Result<(Card, Option<String>)> {
    let rating = rating.to_string();
    run_db(pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("flashcard not found"))?;
        if card.user_id != user_id {
            return Err(AppError::not_found("flashcard not found"));
        }

        let next = Utc::now() + chrono::Duration::days(schedule.interval_days as i64);

        diesel::insert_into(card_reviews::table)
            .values((
                card_reviews::flashcard_id.eq(card.id),
                card_reviews::rating.eq(&rating),
            ))
            .execute(conn)?;

        diesel::update(flashcards::table.find(card.id))
            .set((
                flashcards::interval_days.eq(schedule.interval_days),
                flashcards::ease.eq(schedule.ease),
                flashcards::repetitions.eq(schedule.repetitions),
                flashcards::next_review_at.eq(next),
                flashcards::verified_live.eq(verified_live),
            ))
            .execute(conn)?;

        let updated = flashcards::table.find(card.id).first::<Card>(conn)?;
        let ratings = latest_ratings(conn, &[card.id])?;
        Ok((updated, ratings.get(&card.id).cloned()))
    })
    .await
}

/// Re-confirms a card the tutor has quizzed live after an "easy" self-report —
/// clears the pending-reverification flag.
pub async fn confirm_live(
    pool: &DbPool,
    user_id: Uuid,
    id: Uuid,
) -> Result<(Card, Option<String>)> {
    run_db(pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("flashcard not found"))?;
        if card.user_id != user_id {
            return Err(AppError::not_found("flashcard not found"));
        }

        diesel::update(flashcards::table.find(id))
            .set(flashcards::verified_live.eq(true))
            .execute(conn)?;

        let updated = flashcards::table.find(id).first::<Card>(conn)?;
        let ratings = latest_ratings(conn, &[id])?;
        Ok((updated, ratings.get(&id).cloned()))
    })
    .await
}

/// Flashcards worth quizzing in the live session right now: due for review,
/// or claiming "easy" without having been re-tested live yet.
pub async fn review_targets(
    pool: &DbPool,
    user_id: Uuid,
    limit: i64,
) -> Result<Vec<(Uuid, String, String)>> {
    run_db(pool, move |conn| {
        Ok(flashcards::table
            .filter(flashcards::user_id.eq(user_id))
            .filter(
                flashcards::next_review_at
                    .le(Utc::now())
                    .or(flashcards::verified_live.eq(false)),
            )
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
pub async fn flashcards_metric(pool: &DbPool, user_id: Uuid, planet_id: Uuid) -> Result<f64> {
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

pub async fn delete(pool: &DbPool, user_id: Uuid, id: Uuid) -> Result<()> {
    run_db(pool, move |conn| {
        let card: Card = flashcards::table
            .find(id)
            .first::<Card>(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("flashcard not found"))?;
        if card.user_id != user_id {
            return Err(AppError::not_found("flashcard not found"));
        }
        diesel::delete(flashcards::table.find(id)).execute(conn)?;
        Ok(())
    })
    .await
}

/// Turns a saved correction into a flashcard (the "Make a card" action),
/// inheriting the planet from the correction's conversation.
pub async fn create_from_correction(
    pool: &DbPool,
    user_id: Uuid,
    correction_id: Uuid,
) -> Result<Card> {
    run_db(pool, move |conn| {
        let corr = corrections::table
            .find(correction_id)
            .first::<Correction>(conn)
            .optional()?
            .ok_or_else(|| AppError::not_found("correction not found"))?;
        if corr.user_id != user_id {
            return Err(AppError::not_found("correction not found"));
        }

        let planet_id = match corr.conversation_id {
            Some(cid) => conversations::table
                .find(cid)
                .select(conversations::planet_id)
                .first::<Option<Uuid>>(conn)
                .optional()?
                .flatten(),
            None => None,
        };

        Ok(diesel::insert_into(flashcards::table)
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
            .get_result::<Card>(conn)?)
    })
    .await
}

/// Most recent rating per card (last one wins by reviewed_at order).
fn latest_ratings(
    conn: &mut diesel::pg::PgConnection,
    card_ids: &[Uuid],
) -> std::result::Result<HashMap<Uuid, String>, diesel::result::Error> {
    let rows: Vec<(Uuid, String, chrono::DateTime<chrono::Utc>)> = card_reviews::table
        .filter(card_reviews::flashcard_id.eq_any(card_ids))
        .order(card_reviews::reviewed_at.asc())
        .select((
            card_reviews::flashcard_id,
            card_reviews::rating,
            card_reviews::reviewed_at,
        ))
        .load(conn)?;
    let mut map = HashMap::new();
    for (id, rating, _) in rows {
        map.insert(id, rating); // last one wins
    }
    Ok(map)
}
