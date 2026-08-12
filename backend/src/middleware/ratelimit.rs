//! Per-IP sliding-window rate limiting for sensitive endpoints (auth,
//! realtime token minting, TTS). In-memory and single-process — appropriate
//! for a single-server deployment; swap for a shared store (Redis etc.) if
//! the service ever scales horizontally.

use crate::state::AppState;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Sliding-window rate limiter, keyed by caller (IP).
pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    hits: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            max_requests,
            window: Duration::from_secs(window_secs),
            hits: Mutex::new(HashMap::new()),
        }
    }

    /// Returns true when the request is allowed; records it.
    pub fn allow(&self, key: &str) -> bool {
        let mut hits = match self.hits.lock() {
            Ok(h) => h,
            Err(_) => return true, // never block traffic over a poisoned lock
        };
        let now = Instant::now();
        let queue = hits.entry(key.to_string()).or_default();
        while queue
            .front()
            .is_some_and(|t| now.duration_since(*t) > self.window)
        {
            queue.pop_front();
        }
        if queue.len() >= self.max_requests {
            return false;
        }
        queue.push_back(now);
        true
    }
}

fn rate_limited() -> Response {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(json!({ "error": "Too many attempts. Please wait a minute and try again." })),
    )
        .into_response()
}

/// The shared guard body: one `allow()` against the given limiter, keyed by
/// the caller's socket IP.
async fn enforce(
    limiter: &RateLimiter,
    addr: &SocketAddr,
    request: Request,
    next: Next,
) -> Response {
    if !limiter.allow(&addr.ip().to_string()) {
        return rate_limited();
    }
    next.run(request).await
}

/// Guards /api/auth/* (login + register) and the realtime token minting
/// endpoint against brute-force attempts.
pub async fn auth_ratelimit(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    enforce(&state.auth_limiter, &addr, request, next).await
}

/// Guards the learning write endpoints (conversations, flashcards, planets)
/// against scripted floods — one shared per-IP budget, so abuse that hops
/// between endpoints still hits the same cap.
pub async fn write_ratelimit(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    enforce(&state.write_limiter, &addr, request, next).await
}

/// Guards /api/tts so a single account can't burn OpenAI credits at will.
pub async fn tts_ratelimit(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    enforce(&state.tts_limiter, &addr, request, next).await
}

#[cfg(test)]
mod tests {
    use super::RateLimiter;
    use std::time::Duration;

    #[test]
    fn allows_under_limit_and_rejects_over() {
        let limiter = RateLimiter::new(3, 1);
        assert!(limiter.allow("1.2.3.4"));
        assert!(limiter.allow("1.2.3.4"));
        assert!(limiter.allow("1.2.3.4"));
        assert!(!limiter.allow("1.2.3.4"));
        // A different key is unaffected.
        assert!(limiter.allow("5.6.7.8"));
    }

    #[test]
    fn window_recovers_after_elapsed() {
        let limiter = RateLimiter::new(2, 1);
        assert!(limiter.allow("x"));
        assert!(limiter.allow("x"));
        assert!(!limiter.allow("x"));
        std::thread::sleep(Duration::from_millis(1100));
        assert!(limiter.allow("x"));
    }

    #[test]
    fn separate_keys_are_independent() {
        let limiter = RateLimiter::new(1, 1);
        assert!(limiter.allow("a"));
        assert!(!limiter.allow("a"));
        assert!(limiter.allow("b"));
    }
}
