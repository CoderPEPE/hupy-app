//! User persistence.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{NewUser, User};
use crate::schema::{refresh_tokens, users};
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::Connection;
use diesel::OptionalExtension;
use uuid::Uuid;

pub async fn find_by_email(pool: &DbPool, email: &str) -> Result<Option<User>> {
    let email = email.to_string();
    run_db(pool, move |conn| {
        Ok(users::table
            .filter(users::email.eq(&email))
            .first::<User>(conn)
            .optional()?)
    })
    .await
}

pub async fn find_by_id(pool: &DbPool, user_id: Uuid) -> Result<Option<User>> {
    run_db(pool, move |conn| {
        Ok(users::table.find(user_id).first::<User>(conn).optional()?)
    })
    .await
}

/// Creates the account and its first refresh token in one transaction, so a
/// failure issuing the session rolls the account back — the client must
/// never receive a 500 for an account that actually exists (a retry would
/// then 409 and strand the user). Duplicate emails are rejected inside the
/// transaction, with the UNIQUE constraint as the backstop against racing
/// registrations.
pub async fn create_with_refresh_token(
    pool: &DbPool,
    new_user: &NewUser,
    refresh_token_hash: &str,
    family_id: Uuid,
    expires_at: DateTime<Utc>,
) -> Result<User> {
    let email = new_user.email.clone();
    let new_user = new_user.clone();
    let (refresh_token_hash, family_id, expires_at) =
        (refresh_token_hash.to_string(), family_id, expires_at);
    run_db(pool, move |conn| {
        conn.transaction::<_, AppError, _>(|conn| {
            let existing = users::table
                .filter(users::email.eq(&email))
                .first::<User>(conn)
                .optional()?;
            if existing.is_some() {
                return Err(AppError::conflict(
                    "An account with this email already exists",
                ));
            }
            let user = diesel::insert_into(users::table)
                .values(&new_user)
                .returning(User::as_returning())
                .get_result(conn)?;
            diesel::insert_into(refresh_tokens::table)
                .values((
                    refresh_tokens::user_id.eq(user.id),
                    refresh_tokens::token_hash.eq(&refresh_token_hash),
                    refresh_tokens::family_id.eq(family_id),
                    refresh_tokens::expires_at.eq(expires_at),
                ))
                .execute(conn)?;
            Ok(user)
        })
    })
    .await
}

/// Changes which course the learner is on. A course is the ordered pair
/// (base_language, language) — the explanation language and the taught one.
pub async fn update_course(
    pool: &DbPool,
    user_id: Uuid,
    base_language: &str,
    language: &str,
) -> Result<Option<User>> {
    let (base_language, language) = (base_language.to_string(), language.to_string());
    run_db(pool, move |conn| {
        let updated = diesel::update(users::table.find(user_id))
            .set((
                users::base_language.eq(&base_language),
                users::language.eq(&language),
            ))
            .returning(User::as_returning())
            .get_result(conn)
            .optional()?;
        Ok(updated)
    })
    .await
}

/// Changes the learner's chosen tutor voice (an OpenAI voice id).
pub async fn update_voice(pool: &DbPool, user_id: Uuid, voice: &str) -> Result<Option<User>> {
    let voice = voice.to_string();
    run_db(pool, move |conn| {
        let updated = diesel::update(users::table.find(user_id))
            .set(users::voice.eq(&voice))
            .returning(User::as_returning())
            .get_result(conn)
            .optional()?;
        Ok(updated)
    })
    .await
}

/// Erases the account. Every table that references `users(id)` declares
/// `ON DELETE CASCADE`, so this one statement also takes the refresh tokens,
/// progress, conversations, flashcards, stories and gamification rows with
/// it — there is no orphan left behind and no second pass to keep in sync.
///
/// Returns whether a row was actually removed, so a repeated delete reads as
/// "already gone" rather than a spurious success on a missing account.
pub async fn delete_by_id(pool: &DbPool, user_id: Uuid) -> Result<bool> {
    run_db(pool, move |conn| {
        let removed = diesel::delete(users::table.find(user_id)).execute(conn)?;
        Ok(removed > 0)
    })
    .await
}

/// Changes the learner's display name.
pub async fn update_name(pool: &DbPool, user_id: Uuid, name: &str) -> Result<Option<User>> {
    let name = name.to_string();
    run_db(pool, move |conn| {
        let updated = diesel::update(users::table.find(user_id))
            .set(users::name.eq(&name))
            .returning(User::as_returning())
            .get_result(conn)
            .optional()?;
        Ok(updated)
    })
    .await
}
