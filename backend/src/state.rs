//! Shared application state, cloned into every request handler.
//!
//! Everything here is cheap to clone (`Arc`/pool handles), so handlers can
//! take `State<AppState>` freely. Configuration is frozen at boot and rate
//! limiters are process-scoped.

use crate::config::Config;
use crate::db::DbPool;
use crate::middleware::ratelimit::RateLimiter;
use std::sync::Arc;
use std::time::Duration;

/// One shared HTTP client for all outbound calls (OpenAI Realtime + TTS).
/// Creating a `reqwest::Client` per request would open a fresh connection
/// pool every time; a single pooled client with timeouts is what production
/// needs — a hung upstream must fail the request, not hold it forever.
pub fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build HTTP client")
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub pool: DbPool,
    pub auth_limiter: Arc<RateLimiter>,
    pub tts_limiter: Arc<RateLimiter>,
    /// One shared per-IP budget for all learning write endpoints
    /// (conversations, flashcards, planets), so abuse can't hop between
    /// domains to dodge the cap.
    pub write_limiter: Arc<RateLimiter>,
    /// Outbound HTTP client with timeouts (OpenAI Realtime, TTS).
    pub http_client: reqwest::Client,
}

impl AppState {
    pub fn new(config: Config, pool: DbPool) -> Self {
        Self {
            auth_limiter: Arc::new(RateLimiter::new(
                config.auth_rate_max_requests,
                config.auth_rate_window_secs,
            )),
            tts_limiter: Arc::new(RateLimiter::new(
                config.tts_rate_max_requests,
                config.tts_rate_window_secs,
            )),
            write_limiter: Arc::new(RateLimiter::new(
                config.write_rate_max_requests,
                config.write_rate_window_secs,
            )),
            config: Arc::new(config),
            pool,
            http_client: build_http_client(),
        }
    }

    /// Convenience accessors so handlers read secrets through one obvious
    /// path instead of reaching into `config` directly.
    pub fn jwt_secret(&self) -> &str {
        &self.config.jwt_secret
    }

    pub fn openai_api_key(&self) -> &str {
        &self.config.openai_api_key
    }
}
