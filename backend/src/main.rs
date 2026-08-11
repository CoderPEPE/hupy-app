mod auth;
mod conversations;
mod db;
mod errors;
mod flashcards;
mod gamification;
mod jwt;
mod models;
mod password;
mod planets;
mod ratelimit;
mod realtime;
mod schema;
mod state;
mod tts;

use axum::Router;
use axum::http::header::HeaderValue;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use state::AppState;
use std::env;
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

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    if jwt_secret.len() < 16 {
        tracing::warn!("JWT_SECRET is weak or the default — set a long random value before going live");
    }
    let openai_api_key = env::var("OPENAI_API_KEY").unwrap_or_default();
    let port: u16 = env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);

    let pool = db::establish_pool(&database_url);

    {
        let mut conn = pool
            .get()
            .expect("Failed to get a connection for migrations");
        conn.run_pending_migrations(MIGRATIONS)
            .expect("Failed to run database migrations");
        tracing::info!("database migrations up to date");
    }

    let state = AppState::new(pool, jwt_secret, openai_api_key);

    // CORS is irrelevant for a native app; default to permissive for local
    // dev, but lock it down in production via CORS_ORIGIN (e.g. the web app's
    // origin).
    let cors = match env::var("CORS_ORIGIN").ok() {
        Some(origin) => CorsLayer::new()
            .allow_origin(origin.parse::<HeaderValue>().expect("CORS_ORIGIN must be a valid header value"))
            .allow_methods(Any)
            .allow_headers(Any),
        None => CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any),
    };

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .nest("/api/auth", auth::router(state.clone()))
        .nest("/api/realtime", realtime::router(state.clone()))
        .nest("/api/planets", planets::router())
        .nest("/api/conversations", conversations::router())
        .nest("/api/flashcards", flashcards::router())
        .nest("/api/gamification", gamification::router())
        .nest("/api/tts", tts::router(state.clone()))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    tracing::info!("huppy backend listening on {}", listener.local_addr().unwrap());
    // Provide ConnectInfo (client socket) for the rate-limiting middleware.
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}
