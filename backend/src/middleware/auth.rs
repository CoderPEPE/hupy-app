//! Request authentication: extracts the signed-in user id from a
//! `Bearer <token>` header.

use crate::errors::{AppError, Result};
use crate::jwt;
use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use uuid::Uuid;

/// Extracts the authenticated user id from a `Bearer <token>` header.
pub struct AuthUser(pub Uuid);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::unauthorized("Missing Authorization header"))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::unauthorized("Invalid Authorization header format"))?;

        let claims = jwt::decode_token(state.jwt_secret(), token)
            .map_err(|_| AppError::unauthorized("Invalid or expired token"))?;

        Ok(AuthUser(claims.sub))
    }
}
