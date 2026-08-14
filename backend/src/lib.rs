//! hupy backend library crate.
//!
//! The binary (`main.rs`) only boots and serves; every module lives here so
//! the integration tests in `tests/` can link the whole application and
//! exercise the real HTTP surface end to end — the same routers, the same
//! middleware, the same state the shipped server uses.

pub mod api;
pub mod config;
pub mod db;
pub mod errors;
pub mod jwt;
pub mod middleware;
pub mod models;
pub mod password;
pub mod repositories;
pub mod schema;
pub mod services;
pub mod state;

use axum::http::header::HeaderValue;
use axum::http::StatusCode;
use axum::Router;
use diesel_migrations::{embed_migrations, EmbeddedMigrations};
use state::AppState;
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

/// Applied automatically on every boot so the DB always matches the code.
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

/// Assembles the full HTTP application for the given state — the single place
/// routers are wired, so the binary and the integration tests exercise
/// exactly the same surface (routes, CORS, tracing, rate-limit middleware).
pub fn build_router(state: AppState) -> Router {
    // CORS is irrelevant for a native app; default to permissive for local
    // dev, but lock it down in production via CORS_ORIGIN (e.g. the web app's
    // origin).
    let cors = match state.config.cors_origin.as_deref() {
        Some(origin) => CorsLayer::new()
            .allow_origin(
                origin
                    .parse::<HeaderValue>()
                    .expect("CORS_ORIGIN must be a valid header value"),
            )
            .allow_methods(Any)
            .allow_headers(Any),
        None => CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    };

    Router::new()
        // JSON so API consumers (and the integration tests) can parse it
        // without special-casing a plain-text body.
        .route(
            "/health",
            axum::routing::get(|| async { axum::Json(serde_json::json!("ok")) }),
        )
        .nest("/api/auth", api::auth::router(state.clone()))
        .nest("/api/realtime", api::realtime::router(state.clone()))
        .nest("/api/planets", api::planets::router(state.clone()))
        .nest(
            "/api/conversations",
            api::conversations::router(state.clone()),
        )
        .nest("/api/flashcards", api::flashcards::router(state.clone()))
        .nest("/api/gamification", api::gamification::router())
        .nest("/api/modules", api::modules::router())
        .nest("/api/stories", api::stories::router())
        .nest("/api/tts", api::tts::router(state.clone()))
        .nest("/api/voices", api::voices::router())
        // A global ceiling on how long any handler may run — a stuck DB call
        // or a slow upstream must time out (504) instead of holding a
        // connection forever.
        .layer(TimeoutLayer::with_status_code(
            StatusCode::GATEWAY_TIMEOUT,
            Duration::from_secs(60),
        ))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
