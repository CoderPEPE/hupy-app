//! Refresh-token persistence.
//!
//! Only SHA-256 hashes of refresh tokens are stored, so a database leak
//! cannot be replayed. Rotation runs in a single transaction with the
//! presented row locked (`FOR UPDATE`): presenting a token that was already
//! rotated or explicitly revoked is treated as theft and revokes the whole
//! family — every token minted from the same login — so a stolen token dies
//! the moment it is reused.

use crate::db::{run_db, DbPool};
use crate::errors::{AppError, Result};
use crate::models::RefreshToken;
use crate::schema::refresh_tokens;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::OptionalExtension;
use uuid::Uuid;

/// How a `/auth/refresh` attempt resolved.
#[derive(Debug)]
pub enum RotateOutcome {
    /// The presented token was valid; `token` is the freshly minted row and
    /// the caller should hand out a brand-new refresh token to the client.
    Rotated { token: RefreshToken },
    /// The presented token was already revoked — either rotated before or
    /// logged out. The whole family has been revoked in response.
    ReuseDetected,
    /// The presented token exists but is past its expiry.
    Expired,
    /// No row matches the presented hash.
    Unknown,
}

/// Hashes a raw refresh token for storage (SHA-256, hex-encoded).
pub fn hash_token(raw: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(raw.as_bytes());
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// A raw refresh token: 32 bytes of OS randomness, hex-encoded (64 chars).
/// The raw value is shown to the client exactly once; only its hash is kept.
pub fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut out = String::with_capacity(64);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Stores a new refresh token belonging to `family_id` (a fresh id per
/// login; every rotation reuses its login's family).
pub async fn issue(
    pool: &DbPool,
    user_id: Uuid,
    family_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<RefreshToken> {
    let (token_hash, expires_at) = (token_hash.to_string(), expires_at);
    run_db(pool, move |conn| {
        Ok(diesel::insert_into(refresh_tokens::table)
            .values((
                refresh_tokens::user_id.eq(user_id),
                refresh_tokens::token_hash.eq(&token_hash),
                refresh_tokens::family_id.eq(family_id),
                refresh_tokens::expires_at.eq(expires_at),
            ))
            .returning(RefreshToken::as_returning())
            .get_result(conn)?)
    })
    .await
}

/// Looks up a token by its stored hash (used by logout to find the family).
pub async fn find_by_hash(pool: &DbPool, token_hash: &str) -> Result<Option<RefreshToken>> {
    let token_hash = token_hash.to_string();
    run_db(pool, move |conn| {
        Ok(refresh_tokens::table
            .filter(refresh_tokens::token_hash.eq(&token_hash))
            .first::<RefreshToken>(conn)
            .optional()?)
    })
    .await
}

/// Atomically rotates `presented_hash` into a new token: the presented row
/// is revoked and a fresh token for the same user+family is stored — or, if
/// the presented token was already revoked (reuse), the entire family is
/// revoked instead. Never returns a token for a revoked or expired row.
pub async fn rotate(
    pool: &DbPool,
    presented_hash: &str,
    new_hash: &str,
    new_expires_at: DateTime<Utc>,
) -> Result<RotateOutcome> {
    let (presented_hash, new_hash, new_expires_at) = (
        presented_hash.to_string(),
        new_hash.to_string(),
        new_expires_at,
    );
    run_db(pool, move |conn| {
        conn.transaction::<_, AppError, _>(|conn| {
            rotate_on_conn(conn, &presented_hash, &new_hash, new_expires_at)
        })
    })
    .await
}

/// The rotate body on a caller-provided connection, inside the caller's
/// transaction. Public so tests can drive insert+rotate as one unit of work
/// (immune to other tests' prunes deleting the fixture row between steps).
pub fn rotate_on_conn(
    conn: &mut PgConnection,
    presented_hash: &str,
    new_hash: &str,
    new_expires_at: DateTime<Utc>,
) -> Result<RotateOutcome> {
    let Some(row) = refresh_tokens::table
        .filter(refresh_tokens::token_hash.eq(presented_hash))
        .for_update()
        .first::<RefreshToken>(conn)
        .optional()?
    else {
        return Ok(RotateOutcome::Unknown);
    };

    if row.revoked_at.is_some() {
        // Reuse of a rotated/revoked token: someone is replaying a
        // stolen credential. Revoke every live token in the family so
        // the legitimate owner's session dies with it.
        diesel::update(refresh_tokens::table)
            .filter(refresh_tokens::family_id.eq(row.family_id))
            .filter(refresh_tokens::revoked_at.is_null())
            .set(refresh_tokens::revoked_at.eq(Utc::now()))
            .execute(conn)?;
        return Ok(RotateOutcome::ReuseDetected);
    }

    if row.expires_at <= Utc::now() {
        // Expired — not evidence of theft, just a stale credential.
        return Ok(RotateOutcome::Expired);
    }

    diesel::update(refresh_tokens::table)
        .filter(refresh_tokens::id.eq(row.id))
        .set(refresh_tokens::revoked_at.eq(Utc::now()))
        .execute(conn)?;

    let token = diesel::insert_into(refresh_tokens::table)
        .values((
            refresh_tokens::user_id.eq(row.user_id),
            refresh_tokens::token_hash.eq(new_hash),
            refresh_tokens::family_id.eq(row.family_id),
            refresh_tokens::expires_at.eq(new_expires_at),
        ))
        .returning(RefreshToken::as_returning())
        .get_result(conn)?;

    Ok(RotateOutcome::Rotated { token })
}

/// Revokes every live token of a family (logout): all sessions minted from
/// that login die together. Missing families are a no-op.
pub async fn revoke_family(pool: &DbPool, family_id: Uuid) -> Result<()> {
    run_db(pool, move |conn| {
        diesel::update(refresh_tokens::table)
            .filter(refresh_tokens::family_id.eq(family_id))
            .filter(refresh_tokens::revoked_at.is_null())
            .set(refresh_tokens::revoked_at.eq(Utc::now()))
            .execute(conn)?;
        Ok(())
    })
    .await
}

/// Deletes expired tokens (and anything revoked over 90 days ago), keeping
/// the table bounded without keeping stale rows forever. Callers invoke it
/// opportunistically — a failure here must never fail the auth flow.
pub async fn prune_expired(pool: &DbPool) {
    if let Err(e) = prune_expired_inner(pool).await {
        tracing::warn!("refresh-token prune failed: {e:?}");
    }
}

async fn prune_expired_inner(pool: &DbPool) -> Result<()> {
    run_db(pool, move |conn| {
        let cutoff = Utc::now() - chrono::Duration::days(90);
        diesel::delete(
            refresh_tokens::table
                .filter(refresh_tokens::expires_at.lt(Utc::now()))
                .or_filter(refresh_tokens::revoked_at.lt(cutoff)),
        )
        .execute(conn)?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable_and_hex() {
        let h1 = hash_token("abc");
        let h2 = hash_token("abc");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(hash_token("abc"), hash_token("abd"));
    }

    #[test]
    fn generated_tokens_are_unique_and_hashable() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
        assert_eq!(hash_token(&a).len(), 64);
    }
}
