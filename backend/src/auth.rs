use crate::db::run_db;
use crate::errors::AppError;
use crate::jwt;
use crate::models::{NewUser, User, UserResponse};
use crate::password;
use crate::schema::users;
use crate::state::AppState;
use axum::extract::{FromRequestParts, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use diesel::prelude::*;
use diesel::OptionalExtension;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
        // Per-IP brute-force protection on the auth endpoints.
        .route_layer(middleware::from_fn_with_state(
            state,
            crate::ratelimit::auth_ratelimit,
        ))
}

#[derive(Debug, Deserialize)]
pub struct AuthRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

fn validate_credentials(email: &str, password: &str) -> Result<(), AppError> {
    if email.is_empty() || !email.contains('@') || !email.contains('.') {
        return Err(AppError::bad_request("A valid email is required"));
    }
    if email.len() > 254 {
        return Err(AppError::bad_request("Email is too long"));
    }
    if password.len() < 8 {
        return Err(AppError::bad_request("Password must be at least 8 characters"));
    }
    if password.len() > 128 {
        return Err(AppError::bad_request("Password is too long (max 128 characters)"));
    }
    Ok(())
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    let email = body.email.trim().to_lowercase();
    validate_credentials(&email, &body.password)?;

    let password_hash = password::hash_password(&body.password)
        .map_err(|e| AppError::internal(format!("failed to hash password: {e}")))?;

    let new_user = NewUser {
        id: Uuid::new_v4(),
        email: email.clone(),
        password_hash,
    };

    let user: User = run_db(&state.pool, move |conn| {
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
    .await?;

    let token = jwt::create_token(&state.jwt_secret, user.id)
        .map_err(|e| AppError::internal(format!("failed to create token: {e}")))?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            user: user.into(),
        }),
    ))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let email = body.email.trim().to_lowercase();

    let found = run_db(&state.pool, move |conn| {
        Ok(users::table
            .filter(users::email.eq(&email))
            .first::<User>(conn)
            .optional()?)
    })
    .await?;

    let user = match found {
        Some(u) if password::verify_password(&body.password, &u.password_hash) => u,
        _ => return Err(AppError::unauthorized("Invalid email or password")),
    };

    let token = jwt::create_token(&state.jwt_secret, user.id)
        .map_err(|e| AppError::internal(format!("failed to create token: {e}")))?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

/// Extracts the authenticated user id from a `Bearer <token>` header.
pub struct AuthUser(pub Uuid);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::unauthorized("Missing Authorization header"))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::unauthorized("Invalid Authorization header format"))?;

        let claims = jwt::decode_token(&state.jwt_secret, token)
            .map_err(|_| AppError::unauthorized("Invalid or expired token"))?;

        Ok(AuthUser(claims.sub))
    }
}

async fn me(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<UserResponse>, AppError> {
    let user = run_db(&state.pool, move |conn| {
        Ok(users::table.find(user_id).first::<User>(conn).optional()?)
    })
    .await?
    .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}
