use crate::schema::refresh_tokens;
use chrono::{DateTime, Utc};
use diesel::{Queryable, Selectable};
use uuid::Uuid;

/// One issued refresh token. Only the SHA-256 hash of the token value is
/// stored; `family_id` groups tokens from one login lineage so a reused
/// (possibly stolen) token can revoke the whole family.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = refresh_tokens)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub family_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
}
