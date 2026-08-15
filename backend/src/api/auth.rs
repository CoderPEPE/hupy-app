//! Registration, login and the current-user endpoint.

use crate::errors::{AppError, Result};
use crate::jwt;
use crate::middleware::auth::AuthUser;
use crate::models::{NewUser, User};
use crate::password;
use crate::repositories;
use crate::repositories::refresh_tokens::RotateOutcome;
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
        .route("/google", post(google))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
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
    /// Short-lived access JWT.
    pub token: String,
    /// Opaque rotating refresh token — exchanged for a fresh token pair at
    /// `/auth/refresh`. The client stores it; the server only keeps its hash.
    pub refresh_token: String,
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
        return Err(AppError::bad_request(
            "Name is too long (max 120 characters)",
        ));
    }
    Ok(())
}

/// The token pair a fresh login receives: a short-lived access JWT plus an
/// opaque rotating refresh token. Every login gets a brand-new family id, so
/// logging out on one device never kills another device's session; refresh
/// rotation keeps its login's family.
///
/// `mint_token_pair` is pure (no I/O); the caller decides how to persist the
/// refresh hash — atomically with account creation, or standalone for login.
struct MintedTokenPair {
    access: String,
    raw_refresh: String,
    refresh_hash: String,
    family_id: Uuid,
    expires_at: chrono::DateTime<Utc>,
}

fn mint_token_pair(state: &AppState, user_id: Uuid, family_id: Uuid) -> Result<MintedTokenPair> {
    let access = jwt::create_token(
        state.jwt_secret(),
        user_id,
        state.config.access_token_ttl_secs,
    )
    .map_err(|e| AppError::internal(format!("failed to create token: {e}")))?;
    let raw_refresh = repositories::refresh_tokens::generate_token();
    Ok(MintedTokenPair {
        access,
        refresh_hash: repositories::refresh_tokens::hash_token(&raw_refresh),
        raw_refresh,
        family_id,
        expires_at: chrono::Utc::now()
            + chrono::Duration::seconds(state.config.refresh_token_ttl_secs),
    })
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

    // Mint before persisting so the account and its first refresh token land
    // in one transaction — a failure can never leave an account with no
    // session (which would strand the user behind a retry-409 loop).
    let pair = mint_token_pair(&state, new_user.id, Uuid::new_v4())?;
    let user = repositories::users::create_with_refresh_token(
        &state.pool,
        &new_user,
        &pair.refresh_hash,
        pair.family_id,
        pair.expires_at,
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token: pair.access,
            refresh_token: pair.raw_refresh,
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

    let pair = mint_token_pair(&state, user.id, Uuid::new_v4())?;
    repositories::refresh_tokens::issue(
        &state.pool,
        user.id,
        pair.family_id,
        &pair.refresh_hash,
        pair.expires_at,
    )
    .await?;

    Ok(Json(AuthResponse {
        token: pair.access,
        refresh_token: pair.raw_refresh,
        user: user.into(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct GoogleAuthRequest {
    /// The ID token the native Google sheet handed the app.
    pub id_token: String,
    /// Course choice, used only when this is a first sign-in (the app sends
    /// what the pre-login language picker chose). Existing accounts keep the
    /// course they already have.
    pub language: Option<String>,
    pub base_language: Option<String>,
}

/// Signs in with a Google ID token, creating the account on first use.
///
/// Accounts are matched by email, which is safe *because* the token's
/// `email_verified` claim is checked: Google has proven the holder owns that
/// mailbox. The converse is not true of `/register`, which never verifies
/// email — so a password account claimed with someone else's address before
/// they first sign in with Google would be joined here. Closing that needs
/// email verification on registration, which this endpoint cannot do for it.
async fn google(
    State(state): State<AppState>,
    Json(body): Json<GoogleAuthRequest>,
) -> Result<Json<AuthResponse>> {
    let identity = crate::services::google::verify_id_token(
        &state.http_client,
        body.id_token.trim(),
        &state.config.google_client_ids,
    )
    .await?;

    // Returning learner: mint a session against the existing account and
    // leave their course, voice and name exactly as they set them.
    if let Some(user) = repositories::users::find_by_email(&state.pool, &identity.email).await? {
        let pair = mint_token_pair(&state, user.id, Uuid::new_v4())?;
        repositories::refresh_tokens::issue(
            &state.pool,
            user.id,
            pair.family_id,
            &pair.refresh_hash,
            pair.expires_at,
        )
        .await?;
        return Ok(Json(AuthResponse {
            token: pair.access,
            refresh_token: pair.raw_refresh,
            user: user.into(),
        }));
    }

    let language = body.language.clone().unwrap_or_else(|| "en".into());
    let (base_language, language) = resolve_course_pair(&body.base_language, &language)?;

    let new_user = NewUser {
        id: Uuid::new_v4(),
        email: identity.email,
        // The column is NOT NULL and this account has no password, so it
        // gets the hash of a value nobody holds: /login's Argon2 check can
        // never match it, and the row stays shaped like every other user.
        // ponytail: no `google_sub` column and no provider table — add them
        // when a second provider or account unlinking exists.
        password_hash: password::hash_password(
            &repositories::refresh_tokens::generate_token(),
        )
        .map_err(|e| AppError::internal(format!("failed to hash password: {e}")))?,
        base_language,
        language,
        voice: String::new(),
        name: identity.name,
    };

    let pair = mint_token_pair(&state, new_user.id, Uuid::new_v4())?;
    let user = repositories::users::create_with_refresh_token(
        &state.pool,
        &new_user,
        &pair.refresh_hash,
        pair.family_id,
        pair.expires_at,
    )
    .await?;

    Ok(Json(AuthResponse {
        token: pair.access,
        refresh_token: pair.raw_refresh,
        user: user.into(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    /// Fresh short-lived access JWT.
    pub token: String,
    /// The next refresh token — every call rotates the previous one.
    pub refresh_token: String,
}

/// Rotates a refresh token into a fresh token pair. Every successful call
/// revokes the presented token and mints a new one in the same family;
/// presenting an already-rotated (stolen) token revokes the whole family.
///
/// Tradeoff worth knowing: because rotation is single-use, a refresh that the
/// server processes but the client never receives (lost response) leaves the
/// client holding a now-revoked token — its next refresh attempt triggers
/// reuse detection and revokes the family, logging the user out. This is
/// inherent to single-use rotation; the mobile client minimizes it by never
/// retrying a refresh and by surfacing network failures without declaring
/// the session dead.
async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<RefreshResponse>> {
    let raw = body.refresh_token.trim().to_string();
    if raw.is_empty() {
        return Err(AppError::bad_request("refresh_token is required"));
    }
    if raw.len() > 512 {
        return Err(AppError::bad_request("refresh_token is invalid"));
    }

    // Opportunistic housekeeping: expired/old rows are deleted on the auth
    // hot path (once per refresh) so the table stays bounded. A prune
    // failure is logged, never propagated — auth must not fail over cleanup.
    repositories::refresh_tokens::prune_expired(&state.pool).await;

    // Generate the successor token up front so its hash rides the same
    // rotation transaction and the raw value can be returned to the client.
    let new_raw = repositories::refresh_tokens::generate_token();
    let new_expires_at =
        chrono::Utc::now() + chrono::Duration::seconds(state.config.refresh_token_ttl_secs);

    let outcome = repositories::refresh_tokens::rotate(
        &state.pool,
        &repositories::refresh_tokens::hash_token(&raw),
        &repositories::refresh_tokens::hash_token(&new_raw),
        new_expires_at,
    )
    .await?;

    let RotateOutcome::Rotated { token } = outcome else {
        return Err(AppError::unauthorized("Invalid refresh token"));
    };

    let access = jwt::create_token(
        state.jwt_secret(),
        token.user_id,
        state.config.access_token_ttl_secs,
    )
    .map_err(|e| AppError::internal(format!("failed to create token: {e}")))?;

    Ok(Json(RefreshResponse {
        token: access,
        refresh_token: new_raw,
    }))
}

#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    pub refresh_token: String,
}

/// Revokes the presented token's whole family — every session minted from
/// that login (all rotations of the same login) dies. A missing or already
/// revoked token is still a successful logout (idempotent).
async fn logout(
    State(state): State<AppState>,
    Json(body): Json<LogoutRequest>,
) -> Result<StatusCode> {
    let raw = body.refresh_token.trim().to_string();
    if raw.is_empty() {
        return Err(AppError::bad_request("refresh_token is required"));
    }
    if raw.len() > 512 {
        return Err(AppError::bad_request("refresh_token is invalid"));
    }

    // Find the family for this token, then revoke it. Unknown tokens are
    // idempotently "already logged out".
    let hash = repositories::refresh_tokens::hash_token(&raw);
    let row = repositories::refresh_tokens::find_by_hash(&state.pool, &hash).await?;
    if let Some(row) = row {
        repositories::refresh_tokens::revoke_family(&state.pool, row.family_id).await?;
    }

    Ok(StatusCode::NO_CONTENT)
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
        assert_eq!(
            resolve_course_pair(&None, "en").unwrap(),
            ("pt".into(), "en".into())
        );
        assert_eq!(
            resolve_course_pair(&None, "es").unwrap(),
            ("pt".into(), "es".into())
        );
        assert_eq!(
            resolve_course_pair(&None, "pt").unwrap(),
            ("en".into(), "pt".into())
        );
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
