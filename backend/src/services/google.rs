//! Google Sign-In ID token verification.
//!
//! The mobile app runs the native Google sheet and sends us the resulting ID
//! token. This module is the only thing standing between that token and a
//! minted session, so it verifies rather than trusts:
//!
//! - signature and expiry — delegated to Google's own tokeninfo endpoint
//! - `aud` — must be one of *our* OAuth client IDs, else any Google-signed
//!   token from any app in the world would log someone in here
//! - `email_verified` — an unverified Google email is just a claim

use crate::errors::{AppError, Result};

/// What a verified Google token tells us about the person holding it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleIdentity {
    pub email: String,
    /// Google's display name, or empty when the account has none.
    pub name: String,
}

/// A JWT is three base64url segments; Google's are ~1KB. The cap keeps a
/// junk body from becoming a multi-megabyte query string upstream.
const MAX_ID_TOKEN_LEN: usize = 4096;

/// Reads a tokeninfo field that Google may send as either a JSON bool or the
/// string "true" (the endpoint stringifies some claims and not others).
fn claim_is_true(info: &serde_json::Value, key: &str) -> bool {
    match &info[key] {
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::String(s) => s == "true",
        _ => false,
    }
}

/// Extracts the identity from a verified tokeninfo payload. Split out from
/// the network call so the claim rules are testable without hitting Google.
fn identity_from_claims(
    info: &serde_json::Value,
    allowed_audiences: &[String],
) -> Result<GoogleIdentity> {
    let aud = info["aud"].as_str().unwrap_or_default();
    if !allowed_audiences.iter().any(|id| id == aud) {
        // Deliberately vague to the client, loud in the logs: a mismatch is
        // either a misconfigured GOOGLE_CLIENT_IDS or someone replaying a
        // token minted for a different app.
        tracing::warn!("google sign-in rejected: aud {aud:?} is not an allowed client id");
        return Err(AppError::unauthorized("Invalid Google token"));
    }

    if !claim_is_true(info, "email_verified") {
        return Err(AppError::unauthorized(
            "This Google account has no verified email address",
        ));
    }

    let email = info["email"].as_str().unwrap_or_default().trim().to_lowercase();
    if email.is_empty() {
        return Err(AppError::unauthorized(
            "This Google account did not share an email address",
        ));
    }

    // Names come from a third party, so they are truncated to the same 120
    // characters the rest of the app enforces rather than rejected — a long
    // display name must not be able to fail an otherwise valid login.
    let name: String = info["name"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(120)
        .collect();

    Ok(GoogleIdentity { email, name })
}

/// Verifies a Google ID token and returns who it belongs to.
///
/// ponytail: verification is one call to Google's tokeninfo endpoint — no
/// JWKS cache, no jsonwebtoken RS256 wiring. The ceiling is a network
/// round-trip per sign-in against a rate-limited public endpoint; move to
/// local verification against cached JWKS if sign-in volume makes that hurt.
pub async fn verify_id_token(
    client: &reqwest::Client,
    id_token: &str,
    allowed_audiences: &[String],
) -> Result<GoogleIdentity> {
    // A JWT is base64url segments separated by dots. Checking that up front
    // costs nothing, rejects junk before it reaches Google, and means the
    // token can be interpolated into the query string below without
    // percent-encoding — there is no character left in it that would need it.
    if id_token.is_empty()
        || id_token.len() > MAX_ID_TOKEN_LEN
        || !id_token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        return Err(AppError::bad_request("id_token is invalid"));
    }
    // Fail closed: with no configured client IDs every audience check below
    // would reject anyway, but saying so plainly beats a confusing 401.
    if allowed_audiences.is_empty() {
        return Err(AppError::internal(
            "GOOGLE_CLIENT_IDS is not configured — Google sign-in is disabled",
        ));
    }

    let resp = client
        .get(format!(
            "https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        ))
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach Google tokeninfo: {e}")))?;

    // Google answers 400 for expired, malformed or forged tokens. That is a
    // failed sign-in, not a server fault.
    if !resp.status().is_success() {
        return Err(AppError::unauthorized("Invalid or expired Google token"));
    }

    let info: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::internal(format!("failed to read Google tokeninfo: {e}")))?;

    identity_from_claims(&info, allowed_audiences)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn allowed() -> Vec<String> {
        vec!["web-client-id".to_string(), "ios-client-id".to_string()]
    }

    #[test]
    fn accepts_a_token_minted_for_one_of_our_clients() {
        let info = json!({
            "aud": "ios-client-id",
            "email": "Learner@Example.com",
            "email_verified": "true",
            "name": "Ana Silva",
        });
        let identity = identity_from_claims(&info, &allowed()).unwrap();
        assert_eq!(identity.email, "learner@example.com", "email is normalized");
        assert_eq!(identity.name, "Ana Silva");
    }

    #[test]
    fn rejects_a_token_minted_for_another_app() {
        // The whole point of the audience check: this token is perfectly
        // valid and signed by Google, just not for us.
        let info = json!({
            "aud": "some-other-app.apps.googleusercontent.com",
            "email": "learner@example.com",
            "email_verified": true,
        });
        assert!(identity_from_claims(&info, &allowed()).is_err());
    }

    #[test]
    fn accepts_email_verified_as_bool_or_string() {
        for verified in [json!(true), json!("true")] {
            let info = json!({ "aud": "web-client-id", "email": "a@b.co", "email_verified": verified });
            assert!(identity_from_claims(&info, &allowed()).is_ok());
        }
        for unverified in [json!(false), json!("false"), json!(null)] {
            let info = json!({ "aud": "web-client-id", "email": "a@b.co", "email_verified": unverified });
            assert!(identity_from_claims(&info, &allowed()).is_err());
        }
    }

    #[test]
    fn rejects_a_token_without_an_email() {
        let info = json!({ "aud": "web-client-id", "email_verified": true });
        assert!(identity_from_claims(&info, &allowed()).is_err());
    }

    #[test]
    fn rejects_every_audience_when_none_are_configured() {
        let info = json!({ "aud": "web-client-id", "email": "a@b.co", "email_verified": true });
        assert!(identity_from_claims(&info, &[]).is_err());
    }

    #[test]
    fn long_display_names_are_truncated_not_rejected() {
        let info = json!({
            "aud": "web-client-id",
            "email": "a@b.co",
            "email_verified": true,
            "name": "x".repeat(300),
        });
        let identity = identity_from_claims(&info, &allowed()).unwrap();
        assert_eq!(identity.name.chars().count(), 120);
    }
}
