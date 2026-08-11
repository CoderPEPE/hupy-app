//! Shared application state, cloned into every request handler.
//!
//! Everything here is cheap to clone (`Arc`/pool handles), so handlers can
//! take `State<AppState>` freely. Configuration is frozen at boot and rate
//! limiters are process-scoped.

use crate::config::Config;
use crate::db::DbPool;
use crate::middleware::ratelimit::RateLimiter;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub pool: DbPool,
    pub auth_limiter: Arc<RateLimiter>,
    pub tts_limiter: Arc<RateLimiter>,
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
            config: Arc::new(config),
            pool,
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
