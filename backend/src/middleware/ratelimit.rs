//! Per-IP sliding-window rate limiting for sensitive endpoints (auth,
//! realtime token minting, TTS). In-memory and single-process — appropriate
//! for a single-server deployment; swap for a shared store (Redis etc.) if
//! the service ever scales horizontally.

use crate::state::AppState;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, StatusCode};
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

/// Resolves the bucket key for a caller.
///
/// The socket peer is the honest answer only when the process is reachable
/// directly. Behind a proxy (Railway's edge, an nginx in front) it is the
/// proxy for *every* request, which collapses the whole user base into one
/// bucket — so with `TRUST_PROXY` set we take the client address the proxy
/// recorded instead.
///
/// The rightmost `X-Forwarded-For` entry is the one the trusted hop appended;
/// entries to its left are whatever the client sent and are freely forgeable,
/// so reading the leftmost would let anyone mint unlimited buckets and turn
/// the limiter off.
pub fn client_key(trust_proxy: bool, headers: &HeaderMap, addr: &SocketAddr) -> String {
    if trust_proxy {
        if let Some(ip) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|xff| xff.rsplit(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return ip.to_string();
        }
    }
    addr.ip().to_string()
}

/// The shared guard body: one `allow()` against the given limiter, keyed by
/// the caller's resolved client address.
async fn enforce(
    limiter: &RateLimiter,
    trust_proxy: bool,
    addr: &SocketAddr,
    request: Request,
    next: Next,
) -> Response {
    if !limiter.allow(&client_key(trust_proxy, request.headers(), addr)) {
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
    enforce(
        &state.auth_limiter,
        state.config.trust_proxy,
        &addr,
        request,
        next,
    )
    .await
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
    enforce(
        &state.write_limiter,
        state.config.trust_proxy,
        &addr,
        request,
        next,
    )
    .await
}

/// Guards /api/tts so a single account can't burn OpenAI credits at will.
pub async fn tts_ratelimit(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    enforce(
        &state.tts_limiter,
        state.config.trust_proxy,
        &addr,
        request,
        next,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{client_key, RateLimiter};
    use axum::http::HeaderMap;
    use std::net::SocketAddr;
    use std::time::Duration;

    fn headers(xff: Option<&str>) -> HeaderMap {
        let mut h = HeaderMap::new();
        if let Some(v) = xff {
            h.insert("x-forwarded-for", v.parse().unwrap());
        }
        h
    }

    #[test]
    fn without_trust_proxy_the_socket_peer_is_the_key() {
        let addr: SocketAddr = "203.0.113.7:54321".parse().unwrap();
        // Even a forged header is ignored when no proxy is declared.
        assert_eq!(
            client_key(false, &headers(Some("1.2.3.4")), &addr),
            "203.0.113.7"
        );
    }

    #[test]
    fn with_trust_proxy_the_rightmost_forwarded_hop_wins() {
        let addr: SocketAddr = "10.0.0.1:443".parse().unwrap();
        // The leftmost entries are client-supplied; only the last one was
        // appended by the trusted edge, so a spoofer cannot mint buckets.
        assert_eq!(
            client_key(
                true,
                &headers(Some("1.2.3.4, 5.6.7.8, 198.51.100.9")),
                &addr
            ),
            "198.51.100.9"
        );
        assert_eq!(
            client_key(true, &headers(Some("198.51.100.9")), &addr),
            "198.51.100.9"
        );
    }

    #[test]
    fn with_trust_proxy_a_missing_or_empty_header_falls_back_to_the_peer() {
        let addr: SocketAddr = "10.0.0.1:443".parse().unwrap();
        assert_eq!(client_key(true, &headers(None), &addr), "10.0.0.1");
        assert_eq!(client_key(true, &headers(Some("")), &addr), "10.0.0.1");
        assert_eq!(
            client_key(true, &headers(Some("1.2.3.4,  ")), &addr),
            "10.0.0.1"
        );
    }

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
