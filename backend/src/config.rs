//! Typed application configuration, loaded once from the environment at boot.
//!
//! Required values fail fast with a clear message; tunables fall back to
//! sane defaults so local development needs only `DATABASE_URL`, `JWT_SECRET`
//! and (optionally) `OPENAI_API_KEY`.

use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    /// Postgres connection string.
    pub database_url: String,
    /// HMAC secret for signing JWTs.
    pub jwt_secret: String,
    /// OpenAI API key (empty when not configured).
    pub openai_api_key: String,
    /// Port the HTTP server binds to.
    pub port: u16,
    /// When set, CORS allows only this origin; unset means allow-all (fine
    /// for a native app).
    pub cors_origin: Option<String>,
    /// OpenAI TTS voice and model used by `/api/tts`.
    pub tts_model: String,
    pub tts_voice: String,
    /// Max connections in the r2d2 Postgres pool.
    pub db_pool_max_size: u32,
    /// Per-IP sliding-window limits for the auth endpoints.
    pub auth_rate_max_requests: usize,
    pub auth_rate_window_secs: u64,
    /// Per-IP sliding-window limit for the TTS endpoint.
    pub tts_rate_max_requests: usize,
    pub tts_rate_window_secs: u64,
}

impl Config {
    /// Loads configuration from the process environment.
    ///
    /// Missing secrets return an error that describes exactly which variable
    /// is required, so a misconfigured boot fails loudly instead of limping
    /// along with a broken half of the app.
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL must be set".to_string())?;

        let jwt_secret =
            env::var("JWT_SECRET").map_err(|_| "JWT_SECRET must be set".to_string())?;
        if jwt_secret.len() < 16 {
            tracing::warn!(
                "JWT_SECRET is weak or the default — set a long random value before going live"
            );
        }

        let openai_api_key = env::var("OPENAI_API_KEY").unwrap_or_default();
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);
        let cors_origin = env::var("CORS_ORIGIN").ok();
        let tts_model = env::var("TTS_MODEL").unwrap_or_else(|_| "gpt-4o-mini-tts".into());
        let tts_voice = env::var("TTS_VOICE").unwrap_or_else(|_| "marin".into());
        let db_pool_max_size = env::var("DB_POOL_MAX_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);
        let auth_rate_max_requests = env::var("AUTH_RATE_MAX")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30);
        let auth_rate_window_secs = env::var("AUTH_RATE_WINDOW_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(60);
        let tts_rate_max_requests = env::var("TTS_RATE_MAX")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(120);
        let tts_rate_window_secs = env::var("TTS_RATE_WINDOW_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(60);

        Ok(Self {
            database_url,
            jwt_secret,
            openai_api_key,
            port,
            cors_origin,
            tts_model,
            tts_voice,
            db_pool_max_size,
            auth_rate_max_requests,
            auth_rate_window_secs,
            tts_rate_max_requests,
            tts_rate_window_secs,
        })
    }
}
