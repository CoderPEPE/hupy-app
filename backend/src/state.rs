use crate::db::DbPool;
use crate::ratelimit::RateLimiter;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub jwt_secret: Arc<String>,
    pub openai_api_key: Arc<String>,
    pub auth_limiter: Arc<RateLimiter>,
    pub tts_limiter: Arc<RateLimiter>,
}

impl AppState {
    pub fn new(pool: DbPool, jwt_secret: String, openai_api_key: String) -> Self {
        Self {
            pool,
            jwt_secret: Arc::new(jwt_secret),
            openai_api_key: Arc::new(openai_api_key),
            auth_limiter: Arc::new(RateLimiter::new(30, 60)),
            tts_limiter: Arc::new(RateLimiter::new(120, 60)),
        }
    }
}
