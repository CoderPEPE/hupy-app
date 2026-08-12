use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Crate-wide convenience alias for handlers, services and repositories.
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    BadRequest(String),
    Unauthorized(String),
    Conflict(String),
    NotFound(String),
    Internal(String),
}

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::Unauthorized(msg.into())
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Conflict(msg.into())
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // 4xx messages are user-facing and stay as written. Internal errors
        // are logged in full server-side but never echoed to the client —
        // leaking database/upstream details ("database error: …", OpenAI
        // error JSON) gives attackers reconnaissance they don't need.
        let (status, message) = match self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            AppError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m),
            AppError::Conflict(m) => (StatusCode::CONFLICT, m),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m),
            AppError::Internal(m) => {
                tracing::error!("internal server error: {m}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<diesel::result::Error> for AppError {
    fn from(e: diesel::result::Error) -> Self {
        use diesel::result::DatabaseErrorKind;
        match e {
            diesel::result::Error::NotFound => AppError::NotFound("resource not found".into()),
            diesel::result::Error::DatabaseError(DatabaseErrorKind::UniqueViolation, _) => {
                AppError::Conflict("resource already exists".into())
            }
            other => AppError::internal(format!("database error: {other}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use diesel::result::{DatabaseErrorInformation, DatabaseErrorKind};

    struct TestDbError;
    impl DatabaseErrorInformation for TestDbError {
        fn message(&self) -> &str {
            "duplicate key value violates unique constraint"
        }
        fn details(&self) -> Option<&str> {
            None
        }
        fn hint(&self) -> Option<&str> {
            None
        }
        fn table_name(&self) -> Option<&str> {
            None
        }
        fn column_name(&self) -> Option<&str> {
            None
        }
        fn constraint_name(&self) -> Option<&str> {
            None
        }
        fn statement_position(&self) -> Option<i32> {
            None
        }
    }

    fn status(err: AppError) -> StatusCode {
        err.into_response().status()
    }

    #[test]
    fn status_codes_match_error_kinds() {
        assert_eq!(status(AppError::bad_request("x")), StatusCode::BAD_REQUEST);
        assert_eq!(
            status(AppError::unauthorized("x")),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(status(AppError::conflict("x")), StatusCode::CONFLICT);
        assert_eq!(status(AppError::not_found("x")), StatusCode::NOT_FOUND);
        assert_eq!(
            status(AppError::internal("x")),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[tokio::test]
    async fn response_body_carries_a_json_error_message() {
        let resp = AppError::not_found("planet not found").into_response();
        let body = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["error"], "planet not found");
    }

    #[test]
    fn diesel_not_found_maps_to_404() {
        let err = AppError::from(diesel::result::Error::NotFound);
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn unique_violations_map_to_conflict() {
        let err = AppError::from(diesel::result::Error::DatabaseError(
            DatabaseErrorKind::UniqueViolation,
            Box::new(TestDbError),
        ));
        assert!(matches!(err, AppError::Conflict(_)));
    }

    #[test]
    fn other_database_errors_map_to_internal() {
        let err = AppError::from(diesel::result::Error::DatabaseError(
            DatabaseErrorKind::ForeignKeyViolation,
            Box::new(TestDbError),
        ));
        assert!(matches!(err, AppError::Internal(_)));
    }
}
