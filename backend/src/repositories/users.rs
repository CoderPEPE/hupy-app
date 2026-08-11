//! User persistence.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::{NewUser, User};
use crate::schema::users;
use diesel::prelude::*;
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

/// Inserts a new user, rejecting duplicate emails.
///
/// The existence check and the insert run on the same connection inside one
/// closure, so two racing registrations cannot both pass the check.
pub async fn create(pool: &DbPool, new_user: &NewUser) -> Result<User> {
    let email = new_user.email.clone();
    let new_user = new_user.clone();
    run_db(pool, move |conn| {
        let existing = users::table
            .filter(users::email.eq(&email))
            .first::<User>(conn)
            .optional()?;
        if existing.is_some() {
            return Err(AppError::conflict(
                "An account with this email already exists",
            ));
        }
        Ok(diesel::insert_into(users::table)
            .values(&new_user)
            .returning(User::as_returning())
            .get_result(conn)?)
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
