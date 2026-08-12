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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Config::from_env reads the process environment, and tests mutate it —
    // they must never run concurrently with each other.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    const ALL_VARS: [&str; 12] = [
        "DATABASE_URL",
        "JWT_SECRET",
        "OPENAI_API_KEY",
        "PORT",
        "CORS_ORIGIN",
        "TTS_MODEL",
        "TTS_VOICE",
        "DB_POOL_MAX_SIZE",
        "AUTH_RATE_MAX",
        "AUTH_RATE_WINDOW_SECS",
        "TTS_RATE_MAX",
        "TTS_RATE_WINDOW_SECS",
    ];

    /// Runs `f` with a locked environment, restoring every variable after.
    fn with_env<F: FnOnce(), R: FnOnce() -> T, T>(mutate: F, read: R) -> T {
        let _g = ENV_LOCK.lock().unwrap();
        let saved: Vec<(String, Option<String>)> = ALL_VARS
            .iter()
            .map(|k| (k.to_string(), env::var(k).ok()))
            .collect();
        mutate();
        let result = read();
        for (k, v) in saved {
            match v {
                Some(v) => env::set_var(k, v),
                None => env::remove_var(k),
            }
        }
        result
    }

    #[test]
    fn missing_required_vars_fail_with_a_clear_message() {
        with_env(
            || {
                env::remove_var("DATABASE_URL");
                env::remove_var("JWT_SECRET");
            },
            || {
                assert!(Config::from_env().unwrap_err().contains("DATABASE_URL"));

                env::set_var("DATABASE_URL", "postgres://localhost/huppy");
                env::remove_var("JWT_SECRET");
                assert!(Config::from_env().unwrap_err().contains("JWT_SECRET"));
            },
        );
    }

    #[test]
    fn defaults_apply_when_tunables_are_unset() {
        with_env(
            || {
                env::set_var("DATABASE_URL", "postgres://localhost/huppy");
                env::set_var("JWT_SECRET", "0123456789abcdef0123456789abcdef");
                for k in ALL_VARS.iter().skip(2) {
                    env::remove_var(k);
                }
            },
            || {
                let c = Config::from_env().unwrap();
                assert_eq!(c.port, 3000);
                assert_eq!(c.openai_api_key, "");
                assert_eq!(c.cors_origin, None);
                assert_eq!(c.tts_model, "gpt-4o-mini-tts");
                assert_eq!(c.tts_voice, "marin");
                assert_eq!(c.db_pool_max_size, 10);
                assert_eq!(c.auth_rate_max_requests, 30);
                assert_eq!(c.auth_rate_window_secs, 60);
                assert_eq!(c.tts_rate_max_requests, 120);
                assert_eq!(c.tts_rate_window_secs, 60);
            },
        );
    }

    #[test]
    fn explicit_values_are_read() {
        with_env(
            || {
                env::set_var("DATABASE_URL", "postgres://localhost/huppy");
                env::set_var("JWT_SECRET", "0123456789abcdef0123456789abcdef");
                env::set_var("PORT", "8080");
                env::set_var("CORS_ORIGIN", "https://app.example.com");
                env::set_var("TTS_MODEL", "tts-1");
                env::set_var("TTS_VOICE", "alloy");
                env::set_var("DB_POOL_MAX_SIZE", "3");
                env::set_var("AUTH_RATE_MAX", "5");
                env::set_var("AUTH_RATE_WINDOW_SECS", "10");
                env::set_var("TTS_RATE_MAX", "2");
                env::set_var("TTS_RATE_WINDOW_SECS", "7");
            },
            || {
                let c = Config::from_env().unwrap();
                assert_eq!(c.port, 8080);
                assert_eq!(c.cors_origin.as_deref(), Some("https://app.example.com"));
                assert_eq!(c.tts_model, "tts-1");
                assert_eq!(c.tts_voice, "alloy");
                assert_eq!(c.db_pool_max_size, 3);
                assert_eq!(c.auth_rate_max_requests, 5);
                assert_eq!(c.auth_rate_window_secs, 10);
                assert_eq!(c.tts_rate_max_requests, 2);
                assert_eq!(c.tts_rate_window_secs, 7);
            },
        );
    }

    #[test]
    fn non_numeric_tunables_fall_back_to_defaults() {
        with_env(
            || {
                env::set_var("DATABASE_URL", "postgres://localhost/huppy");
                env::set_var("JWT_SECRET", "0123456789abcdef0123456789abcdef");
                env::set_var("PORT", "not-a-port");
                env::set_var("AUTH_RATE_MAX", "-1");
            },
            || {
                let c = Config::from_env().unwrap();
                assert_eq!(c.port, 3000);
                assert_eq!(c.auth_rate_max_requests, 30);
            },
        );
    }
}
