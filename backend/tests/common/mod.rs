//! Shared harness for the HTTP integration tests.
//!
//! The suite drives the real `build_router` in-process against a disposable
//! Postgres database. Point `TEST_DATABASE_URL` at a scratch server/database
//! you don't care about (e.g. `postgres://localhost/huppy_test`) — never at a
//! database with real data.
//!
//! Every test binary owns its own scratch database: cargo runs the
//! integration suites in parallel, and if they shared one database, one
//! binary's startup truncate would wipe another's in-flight rows (a classic
//! flaky-suite source — tests pass alone, fail under `cargo test`). The
//! binary name (`auth_api`, `planets_api`, …) is suffixed onto the base name
//! and the database is created on first use, so parallel runs never
//! interleave.
//!
//! Users are fully isolated (every table is keyed by user_id), so tests
//! register their own account with a unique email and cannot collide.

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::header::AUTHORIZATION;
use axum::http::{Request, StatusCode};
pub use axum::Router;
use diesel::connection::SimpleConnection;
use diesel::pg::PgConnection;
use diesel::prelude::*;
use diesel_migrations::MigrationHarness;
use huppy_backend::config::Config;
use huppy_backend::db::{establish_pool, DbPool};
use huppy_backend::state::AppState;
use huppy_backend::MIGRATIONS;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::OnceLock;
use tower::ServiceExt;

pub const TEST_SECRET: &str = "integration-test-secret-0123456789abcdef";

/// User-owned tables, wiped between test runs so every suite starts from the
/// seeded catalog and an empty user set. `planets`/`planet_sentences`/
/// `planet_lessons`/`lesson_steps`/`badges`/`tutor_voices` stay (they are the
/// seeded course content every test reads).
const USER_TABLES: &str = "users, conversations, messages, corrections, flashcards, \
     card_reviews, user_stats, user_badges, user_planet_progress, user_sentence_progress, tts_audio";

/// The shared test pool: the per-binary database is created on first use,
/// migrations run once per process, then the user tables are truncated so
/// reruns are deterministic.
pub fn pool() -> &'static DbPool {
    static POOL: OnceLock<DbPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let base = std::env::var("TEST_DATABASE_URL").expect(
            "TEST_DATABASE_URL must point at a disposable Postgres server \
             (e.g. postgres://localhost/huppy_test) — never a database with real data",
        );
        let url = binary_database_url(&base);
        ensure_database(&base, &url);
        let pool = establish_pool(&url, 4);
        {
            let mut conn = pool.get().expect("test db connection");
            conn.run_pending_migrations(MIGRATIONS)
                .expect("test migrations must apply cleanly");
        }
        truncate(&pool);
        pool
    })
}

/// `postgres://user:pass@host:port/base?opts` with the database swapped to
/// `db`, preserving any query-string options (`sslmode`, …) on the end.
fn swap_database(url: &str, db: &str) -> String {
    let (base, query) = match url.split_once('?') {
        Some((base, q)) => (base, Some(q)),
        None => (url, None),
    };
    // The last '/' before any query separates the database from the rest.
    let head = base.rsplit_once('/').map(|(h, _)| h).unwrap_or(base);
    let mut out = format!("{head}/{db}");
    if let Some(q) = query {
        out.push('?');
        out.push_str(q);
    }
    out
}

/// The scratch database for this test binary: `<base>_<binary-stem>`, e.g.
/// `huppy_test_planets_api`. Cargo appends a build hash to the executable
/// name (`planets_api-1a2b3c…`), so the stem is everything before the first
/// `-`. Only safe characters (letters, digits, `_`) ever reach the SQL.
fn binary_database_url(base: &str) -> String {
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "test".into());
    let stem: String = exe
        .split('-')
        .next()
        .unwrap_or("test")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect();
    swap_database(base, &format!("{stem}_test"))
}

/// Creates the per-binary database if it does not exist yet, by connecting
/// to the server's maintenance `postgres` database (the only one guaranteed
/// to exist) and issuing `CREATE DATABASE`. `batch_execute` runs outside a
/// transaction, which `CREATE DATABASE` requires.
fn ensure_database(base: &str, url: &str) {
    let db = url.rsplit('/').next().unwrap_or("").to_string();
    let maint = swap_database(base, "postgres");
    let Ok(mut conn) = PgConnection::establish(&maint) else {
        // The server is unreachable or the role cannot see `postgres`;
        // fall back to assuming the database already exists and let the
        // pool establishment below surface the real error.
        return;
    };
    let exists: i64 = diesel::select(diesel::dsl::sql::<diesel::sql_types::BigInt>(&format!(
        "SELECT count(*) FROM pg_database WHERE datname = '{db}'"
    )))
    .get_result(&mut conn)
    .unwrap_or(0);
    if exists == 0 {
        let _ = conn.batch_execute(&format!("CREATE DATABASE {db}"));
    }
}

/// Wipes all user-owned rows (not the seeded course catalog).
pub fn truncate(pool: &DbPool) {
    let mut conn = pool.get().expect("test db connection");
    conn.batch_execute(&format!("TRUNCATE {USER_TABLES} RESTART IDENTITY CASCADE"))
        .expect("truncating user tables must succeed");
}

/// Builds a fresh router with fresh rate limiters — rate-limit tests get a
/// deterministic per-test budget by tuning the two `max` parameters.
pub fn app(auth_rate_max: usize, tts_rate_max: usize) -> Router {
    let config = Config {
        database_url: String::new(), // the router never connects directly
        jwt_secret: TEST_SECRET.into(),
        openai_api_key: String::new(),
        port: 0,
        cors_origin: None,
        tts_model: "gpt-4o-mini-tts".into(),
        tts_voice: "marin".into(),
        db_pool_max_size: 4,
        auth_rate_max_requests: auth_rate_max,
        auth_rate_window_secs: 60,
        tts_rate_max_requests: tts_rate_max,
        tts_rate_window_secs: 60,
    };
    let state = AppState::new(config, pool().clone());
    huppy_backend::build_router(state)
}

/// Registers a fresh user and returns their bearer token.
pub async fn register(app: &Router, email: &str) -> String {
    let (status, body) = request(
        app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "password": "password123" })),
        "10.0.0.1",
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "register {email}: {body}");
    body["token"].as_str().expect("token in register response").to_string()
}

/// An email no other test can collide with — process id + an atomic
/// monotonic counter. Tests within one binary run on parallel threads, and
/// wall-clock `as_nanos()` alone was observed to collide (two threads
/// registering in the same tick), which surfaced as flaky 409s.
static EMAIL_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub fn unique_email(prefix: &str) -> String {
    let n = EMAIL_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{prefix}-{}-{n}@test.com", std::process::id())
}

/// Fires one request at the in-process router and returns (status, json).
/// The IP feeds the rate-limit middleware exactly like the real socket does.
pub async fn request(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
    ip: &str,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("Content-Type", "application/json")
        .body(Body::from(body.map(|b| b.to_string()).unwrap_or_default()))
        .unwrap();
    if let Some(t) = token {
        req.headers_mut()
            .insert(AUTHORIZATION, format!("Bearer {t}").parse().unwrap());
    }
    let ip: SocketAddr = format!("{ip}:1234").parse().unwrap();
    req.extensions_mut().insert(ConnectInfo(ip));

    let resp = app.clone().oneshot(req).await.expect("router responds");
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024)
        .await
        .expect("read response body");
    let json: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json)
}
