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
        .route("/name", post(set_name))
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
    /// The learner's real name (optional — empty falls back to the
    /// email-derived name on the client).
    pub name: Option<String>,
    /// Which language to start learning: 'en' | 'es' | 'pt' (optional, defaults to 'en').
    pub language: Option<String>,
    /// The learner's own language (explanations): 'en' | 'es' | 'pt'.
    /// Optional — when absent it defaults to Portuguese for en/es targets and
    /// English for pt (the original three courses).
    pub base_language: Option<String>,
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
    /// The learner's real name; empty means the client falls back to the
    /// email-derived name.
    pub name: String,
    /// The learner's own language — how the tutor explains things ('en' | 'es' | 'pt').
    pub base_language: String,
    /// The language being learned ('en' | 'es' | 'pt').
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
            name: u.name,
            base_language: u.base_language,
            language: u.language,
            voice: u.voice,
        }
    }
}

/// Validates a course-language code (base or target); keeps the DB free of
/// junk values.
fn validate_language(language: &str) -> Result<()> {
    if matches!(language, "en" | "es" | "pt") {
        Ok(())
    } else {
        Err(AppError::bad_request(
            "language must be one of 'en', 'es' or 'pt'",
        ))
    }
}

/// Resolves the stored course pair from a request: explicit base when given,
/// else the conventional default for the target. Rejects base == target — a
/// course where you "learn the language you speak" has no seeded content.
pub fn resolve_course_pair(
    base_language: &Option<String>,
    language: &str,
) -> Result<(String, String)> {
    validate_language(language)?;
    let base = match base_language {
        Some(b) => {
            let b = b.trim().to_lowercase();
            validate_language(&b)?;
            b
        }
        None => crate::models::planet::default_base_for(language).to_string(),
    };
    if base == language {
        return Err(AppError::bad_request(
            "the base language cannot be the same as the language being learned",
        ));
    }
    Ok((base, language.to_string()))
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

fn validate_name(name: &str) -> Result<()> {
    if name.chars().count() > 120 {
        return Err(AppError::bad_request("Name is too long (max 120 characters)"));
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

    let language = body.language.clone().unwrap_or_else(|| "en".into());
    let (base_language, language) = resolve_course_pair(&body.base_language, &language)?;

    let name = body.name.clone().unwrap_or_default().trim().to_string();
    validate_name(&name)?;

    let new_user = NewUser {
        id: Uuid::new_v4(),
        email: email.clone(),
        password_hash,
        base_language,
        language,
        voice: String::new(),
        name,
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

/// A valid Argon2 hash of a throwaway password, generated on first use. When
/// the email doesn't exist we verify against this instead of returning early,
/// so "unknown account" and "wrong password" cost the same Argon2 run and the
/// endpoint can't be used to enumerate which accounts exist.
static DUMMY_HASH: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn dummy_hash() -> &'static str {
    DUMMY_HASH.get_or_init(|| {
        password::hash_password("timing-equalizer").expect("argon2 hashing must not fail")
    })
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<Json<AuthResponse>> {
    let email = body.email.trim().to_lowercase();

    let found = repositories::users::find_by_email(&state.pool, &email).await?;

    // Exactly one Argon2 verification on every path (real hash when the
    // account exists, the dummy hash otherwise), so the response time does
    // not reveal whether an email is registered.
    let Some(user) = found else {
        password::verify_password(&body.password, dummy_hash());
        return Err(AppError::unauthorized("Invalid email or password"));
    };
    if !password::verify_password(&body.password, &user.password_hash) {
        return Err(AppError::unauthorized("Invalid email or password"));
    }

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
    /// Optional — when absent, keeps the current base or falls back to the
    /// conventional default for the target.
    pub base_language: Option<String>,
}

/// Switches the signed-in learner to another course (base, target). The next
/// planet list / live session is served from the new course.
async fn set_language(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<SetLanguage>,
) -> Result<Json<UserResponse>> {
    let language = body.language.trim().to_lowercase();
    validate_language(&language)?;

    // When the base isn't sent, keep the current one if it still pairs with
    // the new target (i.e. base != target), else use the conventional default.
    let existing = repositories::users::find_by_id(&state.pool, user_id).await?;
    let base = match &body.base_language {
        Some(b) => {
            let b = b.trim().to_lowercase();
            validate_language(&b)?;
            b
        }
        None => match existing.as_ref() {
            Some(u) if u.base_language != language => u.base_language.clone(),
            _ => crate::models::planet::default_base_for(&language).to_string(),
        },
    };
    if base == language {
        return Err(AppError::bad_request(
            "the base language cannot be the same as the language being learned",
        ));
    }

    let user = repositories::users::update_course(&state.pool, user_id, &base, &language)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}

#[derive(Debug, Deserialize)]
pub struct SetVoice {
    pub voice: String,
}

#[derive(Debug, Deserialize)]
pub struct SetName {
    pub name: String,
}

/// Updates the learner's display name. The next tutor session and every
/// greeting (profile header, chat, voice-picker preview) use it; an empty
/// name falls back to the email-derived name.
async fn set_name(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<SetName>,
) -> Result<Json<UserResponse>> {
    let name = body.name.trim().to_string();
    validate_name(&name)?;

    let user = repositories::users::update_name(&state.pool, user_id, &name)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
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
    // The catalog table is the source of truth (GET /api/voices serves the
    // same rows), so the app can never store a voice the tutor can't speak.
    if !voice.is_empty() && !repositories::voices::exists(&state.pool, &voice).await? {
        return Err(AppError::bad_request(
            "voice must be a known OpenAI voice id",
        ));
    }

    let user = repositories::users::update_voice(&state.pool, user_id, &voice)
        .await?
        .ok_or_else(|| AppError::unauthorized("User no longer exists"))?;

    Ok(Json(user.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_language_accepts_only_the_three_courses() {
        for good in ["en", "es", "pt"] {
            assert!(validate_language(good).is_ok(), "{good}");
        }
        for bad in ["", "fr", "EN", "english", "es ", "pt-PT"] {
            assert!(validate_language(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn resolve_course_pair_defaults_the_base_from_the_target() {
        assert_eq!(resolve_course_pair(&None, "en").unwrap(), ("pt".into(), "en".into()));
        assert_eq!(resolve_course_pair(&None, "es").unwrap(), ("pt".into(), "es".into()));
        assert_eq!(resolve_course_pair(&None, "pt").unwrap(), ("en".into(), "pt".into()));
    }

    #[test]
    fn resolve_course_pair_rejects_base_equals_target() {
        assert!(resolve_course_pair(&Some("en".into()), "en").is_err());
        assert!(resolve_course_pair(&Some("pt".into()), "pt").is_err());
        assert!(resolve_course_pair(&Some("es".into()), "es").is_err());
    }

    #[test]
    fn resolve_course_pair_trims_and_lowercases_the_base() {
        // The base is normalized; the target is validated as sent (callers
        // pass it lowercase).
        let pair = resolve_course_pair(&Some("  PT ".into()), "en").unwrap();
        assert_eq!(pair, ("pt".into(), "en".into()));
    }

    #[test]
    fn credentials_need_a_real_email() {
        assert!(validate_credentials("", "password123").is_err());
        assert!(validate_credentials("no-at-sign", "password123").is_err());
        assert!(validate_credentials("no-dot@example", "password123").is_err());
        assert!(validate_credentials("ok@example.com", "password123").is_ok());
    }

    #[test]
    fn credentials_enforce_password_bounds() {
        assert!(validate_credentials("a@b.co", "short").is_err());
        assert!(validate_credentials("a@b.co", &"x".repeat(129)).is_err());
        assert!(validate_credentials("a@b.co", &"x".repeat(128)).is_ok());
    }

    #[test]
    fn email_length_is_capped() {
        let mut long = "a".repeat(250);
        long.push_str("@example.com");
        assert!(validate_credentials(&long, "password123").is_err());
    }

    #[test]
    fn name_length_is_capped() {
        assert!(validate_name("").is_ok());
        assert!(validate_name(&"a".repeat(120)).is_ok());
        assert!(validate_name(&"a".repeat(121)).is_err());
    }
}
