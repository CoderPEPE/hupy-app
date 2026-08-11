use crate::errors::AppError;
use diesel::pg::PgConnection;
use diesel::r2d2::{self, ConnectionManager};

pub type DbPool = r2d2::Pool<ConnectionManager<PgConnection>>;

pub fn establish_pool(database_url: &str) -> DbPool {
    let manager = ConnectionManager::<PgConnection>::new(database_url);
    r2d2::Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database pool")
}

/// Runs a blocking diesel closure off the async runtime.
pub async fn run_db<T, F>(pool: &DbPool, f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(&mut PgConnection) -> Result<T, AppError> + Send + 'static,
{
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || {
        let mut conn = pool
            .get()
            .map_err(|e| AppError::internal(format!("db connection error: {e}")))?;
        f(&mut conn)
    })
    .await
    .map_err(|e| AppError::internal(format!("db task join error: {e}")))?
}
