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
#[derive(Debug)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::db::DbPool;
    use axum::http::Request;
    use diesel::r2d2::{ConnectionManager, Pool};
    use diesel::PgConnection;

    const SECRET: &str = "unit-test-secret-that-is-long-enough-0123456789";

    /// State whose pool never connects: `build_unchecked` skips the eager
    /// connection check and nothing here calls `get()`.
    fn test_state() -> AppState {
        let manager = ConnectionManager::<PgConnection>::new("postgres://localhost:1/none");
        let pool: DbPool = Pool::builder().max_size(1).build_unchecked(manager);
        let config = Config {
            database_url: String::new(),
            jwt_secret: SECRET.into(),
            openai_api_key: String::new(),
            google_client_ids: Vec::new(),
            apple_client_ids: Vec::new(),
            port: 0,
            trust_proxy: false,
            cors_origin: None,
            tts_model: "gpt-4o-mini-tts".into(),
            tts_voice: "marin".into(),
            story_model: "gpt-4.1-mini".into(),
            db_pool_max_size: 1,
            auth_rate_max_requests: 30,
            auth_rate_window_secs: 60,
            tts_rate_max_requests: 120,
            tts_rate_window_secs: 60,
            write_rate_max_requests: 120,
            write_rate_window_secs: 60,
            tts_cache_max_age_days: 30,
            access_token_ttl_secs: 900,
            refresh_token_ttl_secs: 30 * 24 * 3600,
        };
        AppState::new(config, pool)
    }

    fn parts_with_authorization(value: Option<&str>) -> axum::http::request::Parts {
        let mut builder = Request::builder();
        if let Some(v) = value {
            builder = builder.header(AUTHORIZATION, v);
        }
        let (parts, _) = builder.body(()).unwrap().into_parts();
        parts
    }

    #[tokio::test]
    async fn accepts_a_valid_bearer_token() {
        let state = test_state();
        let user_id = Uuid::new_v4();
        let token = jwt::create_token(SECRET, user_id, 3600).unwrap();
        let mut parts = parts_with_authorization(Some(&format!("Bearer {token}")));
        let user = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap();
        assert_eq!(user.0, user_id);
    }

    #[tokio::test]
    async fn missing_header_is_unauthorized() {
        let state = test_state();
        let mut parts = parts_with_authorization(None);
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Unauthorized(_)));
    }

    #[tokio::test]
    async fn non_bearer_scheme_is_unauthorized() {
        let state = test_state();
        let token = jwt::create_token(SECRET, Uuid::new_v4(), 3600).unwrap();
        for header in [
            format!("Basic {token}"),
            format!("bearer {token}"), // scheme is case-sensitive by design
            "Bearer".to_string(),      // no token at all
            format!("Bearer {token} extra"),
        ] {
            let mut parts = parts_with_authorization(Some(&header));
            let err = AuthUser::from_request_parts(&mut parts, &state)
                .await
                .unwrap_err();
            assert!(
                matches!(err, AppError::Unauthorized(_)),
                "header: {header:?}"
            );
        }
    }

    #[tokio::test]
    async fn tampered_token_is_unauthorized() {
        let state = test_state();
        let token = jwt::create_token(SECRET, Uuid::new_v4(), 3600).unwrap();
        let mut bytes = token.into_bytes();
        let last = bytes.last_mut().unwrap();
        *last = if *last == b'Z' { b'Y' } else { b'Z' };
        let bad = String::from_utf8(bytes).unwrap();
        let mut parts = parts_with_authorization(Some(&format!("Bearer {bad}")));
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Unauthorized(_)));
    }

    #[tokio::test]
    async fn expired_token_is_unauthorized() {
        let state = test_state();
        // Expired by more than the 60s clock-skew leeway jsonwebtoken applies
        // by default — a token 10s past exp is still "valid" by design.
        let expired = jsonwebtoken::encode(
            &jsonwebtoken::Header::default(),
            &jwt::Claims {
                sub: Uuid::new_v4(),
                exp: (chrono::Utc::now().timestamp() - 120) as usize,
            },
            &jsonwebtoken::EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .unwrap();
        let mut parts = parts_with_authorization(Some(&format!("Bearer {expired}")));
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Unauthorized(_)));
    }
}
