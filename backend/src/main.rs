//! Application bootstrap: config -> tracing -> pool -> migrations -> router.
//!
//! All request logic lives in the layered modules (`api`, `services`,
//! `repositories`, `models`, `middleware`); this file only wires them
//! together and serves.

mod api;
mod config;
mod db;
mod errors;
mod jwt;
mod middleware;
mod models;
mod password;
mod repositories;
mod schema;
mod services;
mod state;

use axum::http::header::HeaderValue;
use axum::Router;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use state::AppState;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

/// Applied automatically on every boot so the DB always matches the code.
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "huppy_backend=debug,tower_http=debug".into()),
        )
        .init();

    let config = config::Config::from_env().unwrap_or_else(|e| panic!("{e}"));

    let pool = db::establish_pool(&config.database_url, config.db_pool_max_size);

    {
        let mut conn = pool
            .get()
            .expect("Failed to get a connection for migrations");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("Failed to run database migrations");
        tracing::info!("database migrations up to date");
    }

    let port = config.port;
    let state = AppState::new(config, pool);

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

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .nest("/api/auth", api::auth::router(state.clone()))
        .nest("/api/realtime", api::realtime::router(state.clone()))
        .nest("/api/planets", api::planets::router())
        .nest("/api/conversations", api::conversations::router())
        .nest("/api/flashcards", api::flashcards::router())
        .nest("/api/gamification", api::gamification::router())
        .nest("/api/tts", api::tts::router(state.clone()))
        .nest("/api/voices", api::voices::router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    tracing::info!(
        "huppy backend listening on {}",
        listener.local_addr().unwrap()
    );
    // Provide ConnectInfo (client socket) for the rate-limiting middleware.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
