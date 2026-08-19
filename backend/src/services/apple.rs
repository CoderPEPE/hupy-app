//! Sign in with Apple identity-token verification.
//!
//! Apple has no `tokeninfo`-style endpoint the way Google does, so the token
//! is verified locally: fetch Apple's public JWKS, pick the key named by the
//! token's `kid`, and let `jsonwebtoken` check the RS256 signature, `exp`,
//! `iss` and `aud`. Everything that matters is checked rather than trusted:
//!
//! - signature — against Apple's published key for that `kid`
//! - `iss` — must be Apple itself
//! - `aud` — must be one of *our* client IDs (the iOS bundle id), else any
//!   Apple-signed token from any app would log someone in here
//! - `email_verified` — an unverified address is just a claim
//!
//! Note Apple sends the user's *name* only in the first-authorization
//! credential, never in the token, so the caller passes it in separately.

use crate::errors::{AppError, Result};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

const APPLE_ISSUER: &str = "https://appleid.apple.com";
const APPLE_JWKS_URL: &str = "https://appleid.apple.com/auth/keys";

/// A JWT is three base64url segments; Apple's are ~1KB. The cap keeps a junk
/// body from becoming a multi-megabyte parse.
const MAX_IDENTITY_TOKEN_LEN: usize = 4096;

/// What a verified Apple token tells us about the person holding it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppleIdentity {
    pub email: String,
}

/// The claims we care about. Apple stringifies some booleans and not others,
/// hence the untagged bool-or-string shape.
#[derive(Debug, Deserialize)]
struct AppleClaims {
    #[serde(default)]
    email: String,
    #[serde(default)]
    email_verified: Option<BoolOrString>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum BoolOrString {
    Bool(bool),
    Str(String),
}

impl BoolOrString {
    fn is_true(&self) -> bool {
        match self {
            BoolOrString::Bool(b) => *b,
            BoolOrString::Str(s) => s == "true",
        }
    }
}

/// Turns verified claims into an identity. Split out from the network call so
/// the claim rules are testable without reaching Apple.
fn identity_from_claims(claims: AppleClaims) -> Result<AppleIdentity> {
    // A private-relay address (`@privaterelay.appleid.com`) is always
    // verified and is a perfectly good account identifier — Apple guarantees
    // delivery through it — so it is accepted like any other.
    if !claims.email_verified.map(|v| v.is_true()).unwrap_or(false) {
        return Err(AppError::unauthorized(
            "This Apple account has no verified email address",
        ));
    }

    let email = claims.email.trim().to_lowercase();
    if email.is_empty() {
        // Apple omits `email` on repeat sign-ins for some configurations;
        // the client always sends the first-authorization token, so an empty
        // one here means the credential was not the one we asked for.
        return Err(AppError::unauthorized(
            "This Apple account did not share an email address",
        ));
    }

    Ok(AppleIdentity { email })
}

/// Verifies an Apple identity token and returns who it belongs to.
///
/// ponytail: the JWKS is fetched per sign-in rather than cached. The ceiling
/// is one extra round-trip to a CDN-backed public endpoint per login, which
/// matches what the Google path already costs; add a TTL cache if sign-in
/// volume ever makes it show up in latency.
pub async fn verify_identity_token(
    client: &reqwest::Client,
    identity_token: &str,
    allowed_audiences: &[String],
) -> Result<AppleIdentity> {
    if identity_token.is_empty()
        || identity_token.len() > MAX_IDENTITY_TOKEN_LEN
        || !identity_token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return Err(AppError::bad_request("identity_token is invalid"));
    }
    // Fail closed: with no configured client IDs every audience check below
    // would reject anyway, but saying so plainly beats a confusing 401.
    if allowed_audiences.is_empty() {
        return Err(AppError::internal(
            "APPLE_CLIENT_IDS is not configured — Sign in with Apple is disabled",
        ));
    }

    let kid = decode_header(identity_token)
        .map_err(|_| AppError::unauthorized("Invalid Apple token"))?
        .kid
        .ok_or_else(|| AppError::unauthorized("Invalid Apple token"))?;

    let jwks: JwkSet = client
        .get(APPLE_JWKS_URL)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach Apple keys: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::internal(format!("failed to read Apple keys: {e}")))?;

    let jwk = jwks
        .find(&kid)
        // A kid we don't know means Apple rotated keys since this token was
        // minted, or the token isn't Apple's at all. Both are failed
        // sign-ins, not server faults.
        .ok_or_else(|| AppError::unauthorized("Invalid or expired Apple token"))?;
    let key = DecodingKey::from_jwk(jwk)
        .map_err(|e| AppError::internal(format!("unusable Apple key: {e}")))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[APPLE_ISSUER]);
    validation.set_audience(allowed_audiences);

    let data = decode::<AppleClaims>(identity_token, &key, &validation).map_err(|e| {
        // Deliberately vague to the client, loud in the logs: this is either
        // a misconfigured APPLE_CLIENT_IDS or someone replaying a token
        // minted for a different app.
        tracing::warn!("apple sign-in rejected: {e}");
        AppError::unauthorized("Invalid or expired Apple token")
    })?;

    identity_from_claims(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claims(email: &str, verified: Option<BoolOrString>) -> AppleClaims {
        AppleClaims {
            email: email.to_string(),
            email_verified: verified,
        }
    }

    #[test]
    fn accepts_a_verified_address_and_normalizes_it() {
        let id = identity_from_claims(claims(
            "  Learner@Example.COM ",
            Some(BoolOrString::Bool(true)),
        ))
        .unwrap();
        assert_eq!(id.email, "learner@example.com");
    }

    #[test]
    fn accepts_email_verified_as_bool_or_string() {
        for v in [BoolOrString::Bool(true), BoolOrString::Str("true".into())] {
            assert!(identity_from_claims(claims("a@b.co", Some(v))).is_ok());
        }
        for v in [BoolOrString::Bool(false), BoolOrString::Str("false".into())] {
            assert!(identity_from_claims(claims("a@b.co", Some(v))).is_err());
        }
        // Absent is not verified.
        assert!(identity_from_claims(claims("a@b.co", None)).is_err());
    }

    #[test]
    fn accepts_a_private_relay_address() {
        let id = identity_from_claims(claims(
            "abc123@privaterelay.appleid.com",
            Some(BoolOrString::Bool(true)),
        ))
        .unwrap();
        assert_eq!(id.email, "abc123@privaterelay.appleid.com");
    }

    #[test]
    fn rejects_a_token_without_an_email() {
        assert!(identity_from_claims(claims("   ", Some(BoolOrString::Bool(true)))).is_err());
    }
}
