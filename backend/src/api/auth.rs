//! Registration, login and the current-user endpoint.

use crate::errors::{AppError, Result};
use crate::jwt;
use crate::middleware::auth::AuthUser;
use crate::models::{NewUser, User};
use crate::password;
use crate::repositories;
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::middleware;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
        .route("/language", post(set_language))
        .route("/voice", post(set_voice))
        // Per-IP brute-force protection on the auth endpoints.
        .route_layer(middleware::from_fn_with_state(
            state,
            crate::middleware::ratelimit::auth_ratelimit,
        ))
}

#[derive(Debug, Deserialize)]
pub struct AuthRequest {
    pub email: String,
    pub password: String,
    /// Which course to start on: 'en' | 'es' | 'pt' (optional, defaults to 'en').
    pub language: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

/// The public shape of a user (never includes the password hash).
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
    /// The learner's chosen course ('en' | 'es' | 'pt').
    pub language: String,
    /// Chosen tutor voice (OpenAI voice id); empty = per-language default.
    pub voice: String,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            language: u.language,
            voice: u.voice,
        }
    }
}

/// Validates a course-language code; keeps the DB free of junk values.
fn validate_language(language: &str) -> Result<()> {
    if matches!(language, "en" | "es" | "pt") {
        Ok(())
    } else {
        Err(AppError::bad_request(
            "language must be one of 'en', 'es' or 'pt'",
        ))
    }
}

fn validate_credentials(email: &str, password: &str) -> Result<()> {
    if email.is_empty() || !email.contains('@') || !email.contains('.') {
        return Err(AppError::bad_request("A valid email is required"));
    }
    if email.len() > 254 {
        return Err(AppError::bad_request("Email is too long"));
    }
    if password.len() < 8 {
        return Err(AppError::bad_request(
            "Password must be at least 8 characters",
        ));
    }
    if password.len() > 128 {
        return Err(AppError::bad_request(
            "Password is too long (max 128 characters)",
        ));
    }
    Ok(())
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<(StatusCode, Json<AuthResponse>)> {
    let email = body.email.trim().to_lowercase();
    validate_credentials(&email, &body.password)?;

    let password_hash = password::hash_password(&body.password)
        .map_err(|e| AppError::internal(format!("failed to hash password: {e}")))?;

    let language = body.language.unwrap_or_else(|| "en".into());
    validate_language(&language)?;

    let new_user = NewUser {
        id: Uuid::new_v4(),
        email: email.clone(),
        password_hash,
        language,
        voice: String::new(),
    };

    let user = repositories::users::create(&state.pool, &new_user).await?;

    let token = jwt::create_token(state.jwt_secret(), user.id)
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
) -> Result<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();

    let found = repositories::users::find_by_email(&state.pool, &email).await?;

    let user = match found {
        Some(u) if password::verify_password(&body.password, &u.password_hash) => u,
        _ => return Err(AppError::unauthorized("Invalid email or password")),
    };

    let token = jwt::create_token(state.jwt_secret(), user.id)
        .map_err(|e| AppError::internal(format!("failed to create token: {e}")))?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

async fn me(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Result<Json<UserResponse>> {
    let user = repositories::users::find_by_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}

#[derive(Debug, Deserialize)]
pub struct SetLanguage {
    pub language: String,
}

/// Switches the signed-in learner to another course ('en' | 'es' | 'pt').
/// The next planet list / live session is served from the new course.
async fn set_language(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<SetLanguage>,
) -> Result<Json<UserResponse>> {
    let language = body.language.trim().to_lowercase();
    validate_language(&language)?;

    let user = repositories::users::update_language(&state.pool, user_id, &language)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}

/// The OpenAI voice ids the tutor may use. Kept on the server so the stored
/// value can never point at a voice the TTS/Realtime APIs would reject, and
/// so both the app and the API agree on what exists.
pub const KNOWN_VOICES: [&str; 15] = [
    "alloy", "ash", "ballad", "coral", "echo", "fable", "jade", "lys", "marin",
    "nova", "onyx", "sage", "shimmer", "spruce", "verse",
];

#[derive(Debug, Deserialize)]
pub struct SetVoice {
    pub voice: String,
}

/// Picks the tutor's voice (an OpenAI voice id). The next Realtime session
/// and TTS previews speak with it; an empty string resets to the course's
/// per-language default.
async fn set_voice(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<SetVoice>,
) -> Result<Json<UserResponse>> {
    let voice = body.voice.trim().to_lowercase();
    if !voice.is_empty() && !KNOWN_VOICES.contains(&voice.as_str()) {
        return Err(AppError::bad_request(
            "voice must be a known OpenAI voice id",
        ));
    }

    let user = repositories::users::update_voice(&state.pool, user_id, &voice)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}
