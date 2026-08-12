//! Application bootstrap: config -> tracing -> pool -> migrations -> router.
//!
//! All request logic lives in the library crate (`lib.rs` and its modules);
//! this file only wires them together and serves. Keeping the router in the
//! lib lets the integration tests in `tests/` exercise the exact same app.

use diesel_migrations::MigrationHarness;
use huppy_backend::{build_router, config, db, state::AppState, MIGRATIONS};
use std::net::SocketAddr;

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

    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    tracing::info!(
        "huppy backend listening on {}",
        listener.local_addr().unwrap()
    );
    // Provide ConnectInfo (client socket) for the rate-limiting middleware.
    // `with_graceful_shutdown` lets in-flight requests finish when the
    // process receives SIGTERM/SIGINT (deploys, `docker stop`, Ctrl+C)
    // instead of dropping them mid-flight.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .unwrap();
}

/// Waits for SIGINT (Ctrl+C) or SIGTERM (docker stop, orchestrated deploys)
/// and returns, triggering the server's graceful drain.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
    tracing::info!("shutdown signal received, draining in-flight requests");
}
