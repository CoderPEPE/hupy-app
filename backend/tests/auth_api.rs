//! Auth API integration tests: registration, login, session (`/me`), course
//! and voice settings, and the per-IP brute-force rate limit.

mod common;

use common::{app, register, request, unique_email, Router, TEST_SECRET};
use diesel::prelude::*;
use huppy_backend::jwt;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn register_creates_a_user_and_returns_a_token() {
    let app = app(30, 120);
    let email = unique_email("reg");
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({
            "email": email,
            "password": "password123",
            "name": "Ada Lovelace",
            "base_language": "pt",
            "language": "en",
        })),
        "10.0.1.1",
    )
    .await;

    assert_eq!(status.as_u16(), 201, "{body}");
    assert!(body["token"].as_str().unwrap().len() > 20);
    assert!(
        body["refresh_token"].as_str().unwrap().len() >= 64,
        "refresh token is an opaque hex string: {body}"
    );
    assert_eq!(body["user"]["email"], email);
    assert_eq!(body["user"]["name"], "Ada Lovelace");
    assert_eq!(body["user"]["base_language"], "pt");
    assert_eq!(body["user"]["language"], "en");
    // The response must never expose the password hash.
    assert!(body["user"].get("password_hash").is_none());
}

#[tokio::test]
async fn register_validates_inputs() {
    let app = app(30, 120);

    // Missing @ / . in the email.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": "not-an-email", "password": "password123" })),
        "10.0.1.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Password too short.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("reg"), "password": "short" })),
        "10.0.1.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Unknown target language.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("reg"), "password": "password123", "language": "fr" })),
        "10.0.1.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // base == target is not a course.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("reg"), "password": "password123", "language": "en", "base_language": "en" })),
        "10.0.1.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");
}

#[tokio::test]
async fn duplicate_email_is_conflict() {
    let app = app(30, 120);
    let email = unique_email("dup");
    register(&app, &email).await;

    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "password": "password123" })),
        "10.0.1.3",
    )
    .await;
    assert_eq!(status.as_u16(), 409, "{body}");
}

#[tokio::test]
async fn login_and_me_roundtrip() {
    let app = app(30, 120);
    let email = unique_email("login");
    let token = register(&app, &email).await;

    // Wrong password and unknown email both say the same thing (401).
    for (body, ip) in [
        (
            json!({ "email": email, "password": "wrong-password" }),
            "10.0.2.1",
        ),
        (
            json!({ "email": unique_email("ghost"), "password": "password123" }),
            "10.0.2.2",
        ),
    ] {
        let (status, resp) = request(&app, "POST", "/api/auth/login", None, Some(body), ip).await;
        assert_eq!(status.as_u16(), 401, "{resp}");
        assert!(resp["error"]
            .as_str()
            .unwrap()
            .contains("Invalid email or password"));
    }

    // Correct password.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        Some(json!({ "email": email, "password": "password123" })),
        "10.0.2.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    let token2 = body["token"].as_str().unwrap().to_string();
    assert!(
        body["refresh_token"].as_str().unwrap().len() >= 64,
        "login also issues a refresh token: {body}"
    );

    // Both tokens hit /me.
    for t in [&token, &token2] {
        let (status, me) = request(&app, "GET", "/api/auth/me", Some(t), None, "10.0.2.4").await;
        assert_eq!(status.as_u16(), 200, "{me}");
        assert_eq!(me["email"], email);
    }
}

#[tokio::test]
async fn me_requires_a_valid_token() {
    let app = app(30, 120);

    let (status, body) = request(&app, "GET", "/api/auth/me", None, None, "10.0.3.1").await;
    assert_eq!(status.as_u16(), 401, "{body}");

    let (status, body) = request(
        &app,
        "GET",
        "/api/auth/me",
        Some("garbage.token.here"),
        None,
        "10.0.3.2",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");

    // A correctly-signed but already-expired token must also be rejected —
    // sign it directly, since create_token only ever mints live tokens. It
    // must be past the 60s clock-skew leeway to count as expired.
    let expired = jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &jwt::Claims {
            sub: Uuid::new_v4(),
            exp: (chrono::Utc::now().timestamp() - 120) as usize,
        },
        &jsonwebtoken::EncodingKey::from_secret(TEST_SECRET.as_bytes()),
    )
    .unwrap();
    let (status, body) = request(
        &app,
        "GET",
        "/api/auth/me",
        Some(&expired),
        None,
        "10.0.3.3",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");
}

#[tokio::test]
async fn course_and_voice_and_name_settings() {
    let app = app(30, 120);
    let email = unique_email("settings");
    let token = register(&app, &email).await;

    // Switch to a valid course (es -> en).
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/language",
        Some(&token),
        Some(json!({ "language": "es", "base_language": "pt" })),
        "10.0.4.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["language"], "es");
    assert_eq!(body["base_language"], "pt");

    // base == target rejected.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/language",
        Some(&token),
        Some(json!({ "language": "es", "base_language": "es" })),
        "10.0.4.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Voice must be a known catalog voice.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/voice",
        Some(&token),
        Some(json!({ "voice": "not-a-real-voice" })),
        "10.0.4.3",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/voice",
        Some(&token),
        Some(json!({ "voice": "coral" })),
        "10.0.4.4",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["voice"], "coral");

    // Name is capped at 120 chars.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/name",
        Some(&token),
        Some(json!({ "name": "x".repeat(121) })),
        "10.0.4.5",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/name",
        Some(&token),
        Some(json!({ "name": "Serge" })),
        "10.0.4.6",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["name"], "Serge");
}

/// A fresh (email, access token, refresh token) triple.
async fn register_pair(app: &Router, email: &str) -> (String, String) {
    let (status, body) = request(
        app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "password": "password123" })),
        "10.0.9.1",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{body}");
    (
        body["token"].as_str().unwrap().to_string(),
        body["refresh_token"].as_str().unwrap().to_string(),
    )
}

#[tokio::test]
async fn refresh_rotates_the_token_pair() {
    let app = app(30, 120);
    let (access, refresh) = register_pair(&app, &unique_email("rot")).await;

    // The original access token works.
    let (status, _) = request(&app, "GET", "/api/auth/me", Some(&access), None, "10.0.9.2").await;
    assert_eq!(status.as_u16(), 200);

    // Refresh: new access token + a new refresh token.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.9.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    let access2 = body["token"].as_str().unwrap().to_string();
    let refresh2 = body["refresh_token"].as_str().unwrap().to_string();
    // The refresh token always rotates; the access JWT may be byte-identical
    // when both are minted in the same second (same claims), so only assert
    // the rotation that matters.
    assert_ne!(refresh2, refresh);

    // The new access token is valid.
    let (status, _) = request(
        &app,
        "GET",
        "/api/auth/me",
        Some(&access2),
        None,
        "10.0.9.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200);

    // The old refresh token is dead after rotation.
    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.9.3",
    )
    .await;
    assert_eq!(status.as_u16(), 401);
}

#[tokio::test]
async fn reusing_a_rotated_token_revokes_the_whole_family() {
    let app = app(30, 120);
    let (_, refresh) = register_pair(&app, &unique_email("reuse")).await;

    // Rotate once — the presented token is now revoked.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.10.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    let refresh2 = body["refresh_token"].as_str().unwrap().to_string();

    // Replaying the *old* token is a reuse-detection event: 401, and the
    // whole family (including the token minted last step) is revoked.
    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.10.2",
    )
    .await;
    assert_eq!(status.as_u16(), 401);

    // The previously-valid successor is now dead too.
    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh2 })),
        "10.0.10.2",
    )
    .await;
    assert_eq!(status.as_u16(), 401);
}

#[tokio::test]
async fn logout_revokes_the_family_and_refresh_then_fails() {
    let app = app(30, 120);
    let (_, refresh) = register_pair(&app, &unique_email("logout")).await;

    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/logout",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.11.1",
    )
    .await;
    assert_eq!(status.as_u16(), 204);

    // The token is gone — refresh must fail.
    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": refresh })),
        "10.0.11.2",
    )
    .await;
    assert_eq!(status.as_u16(), 401);
}

/// The `Expired` arm of `rotate` directly (the HTTP handler prunes expired
/// rows before rotating, so this outcome is only reachable at the repository
/// layer or in a prune race — it must still be correct). Insert + rotate run
/// in ONE transaction so parallel tests' prunes can't delete the fixture row
/// between the two steps.
#[tokio::test]
async fn rotate_returns_expired_for_a_past_dated_token() {
    let (status, register_body) = request(
        &app(30, 120),
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("expired-arm"), "password": "password123" })),
        "10.0.12.5",
    )
    .await;
    assert_eq!(status.as_u16(), 201);
    let user_id = Uuid::parse_str(register_body["user"]["id"].as_str().unwrap()).unwrap();

    let raw = "rotate-expired-arm-token-000000000000000000000000";
    let hash = huppy_backend::repositories::refresh_tokens::hash_token(raw);
    let new_hash = huppy_backend::repositories::refresh_tokens::hash_token("brand-new");

    let outcome = huppy_backend::db::run_db(common::pool(), move |conn| {
        conn.transaction::<_, huppy_backend::errors::AppError, _>(|conn| {
            diesel::insert_into(huppy_backend::schema::refresh_tokens::table)
                .values((
                    huppy_backend::schema::refresh_tokens::user_id.eq(user_id),
                    huppy_backend::schema::refresh_tokens::token_hash.eq(&hash),
                    huppy_backend::schema::refresh_tokens::family_id.eq(Uuid::new_v4()),
                    huppy_backend::schema::refresh_tokens::expires_at
                        .eq(chrono::Utc::now() - chrono::Duration::minutes(1)),
                ))
                .execute(conn)?;
            huppy_backend::repositories::refresh_tokens::rotate_on_conn(
                conn,
                &hash,
                &new_hash,
                chrono::Utc::now() + chrono::Duration::days(30),
            )
        })
    })
    .await
    .expect("insert + rotate must not error");

    assert!(
        matches!(
            outcome,
            huppy_backend::repositories::refresh_tokens::RotateOutcome::Expired
        ),
        "expired token must be rejected as Expired, got: {outcome:?}"
    );
}

/// A raw token that exists in the DB but is already past its expiry — the
/// `Expired` arm of the rotate outcome (distinct from Unknown and Reuse).
#[tokio::test]
async fn refresh_with_an_expired_token_is_unauthorized() {
    let app = app(30, 120);
    let (status, register_body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("expired"), "password": "password123" })),
        "10.0.12.3",
    )
    .await;
    assert_eq!(status.as_u16(), 201);
    let user_id = Uuid::parse_str(register_body["user"]["id"].as_str().unwrap()).unwrap();

    // Issue a token directly with a past expiry (the API never does this).
    let raw = "known-expired-token-0000000000000000000000000000";
    let hash = huppy_backend::repositories::refresh_tokens::hash_token(raw);
    huppy_backend::repositories::refresh_tokens::issue(
        common::pool(),
        user_id,
        Uuid::new_v4(),
        &hash,
        chrono::Utc::now() - chrono::Duration::minutes(1),
    )
    .await
    .expect("insert expired token");

    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": raw })),
        "10.0.12.4",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");
}

#[tokio::test]
async fn refresh_with_an_unknown_token_is_unauthorized() {
    let app = app(30, 120);
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": "f".repeat(64) })),
        "10.0.12.1",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");

    // Missing / malformed body.
    let (status, body) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": "" })),
        "10.0.12.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");
}

/// Two clients racing the SAME refresh token (a real scenario when a stolen
/// token is replayed): exactly one rotation wins, the loser triggers reuse
/// detection and revokes the whole family — including the winner's brand-new
/// token. The `FOR UPDATE` lock serializes them.
#[tokio::test]
async fn concurrent_refresh_with_the_same_token_rotates_exactly_once() {
    let app = app(30, 120);
    let (_, refresh) = register_pair(&app, &unique_email("race")).await;

    let app_a = app.clone();
    let app_b = app.clone();
    let body_a = json!({ "refresh_token": refresh.clone() });
    let body_b = json!({ "refresh_token": refresh });
    let (ra, rb) = tokio::join!(
        request(
            &app_a,
            "POST",
            "/api/auth/refresh",
            None,
            Some(body_a),
            "10.0.13.1"
        ),
        request(
            &app_b,
            "POST",
            "/api/auth/refresh",
            None,
            Some(body_b),
            "10.0.13.2"
        ),
    );

    let codes = [ra.0.as_u16(), rb.0.as_u16()];
    assert_eq!(
        codes.iter().filter(|c| **c == 200).count(),
        1,
        "exactly one winner: {codes:?}"
    );
    assert_eq!(
        codes.iter().filter(|c| **c == 401).count(),
        1,
        "the loser triggers reuse detection: {codes:?}"
    );

    // The winner's fresh token is dead too (family revoked by reuse
    // detection) — the theft is fully cut off, at the cost of the legit
    // client's session, which is the intended tradeoff.
    let winner_body = if ra.0.as_u16() == 200 { ra.1 } else { rb.1 };
    let next = winner_body["refresh_token"].as_str().unwrap().to_string();
    let (status, _) = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(json!({ "refresh_token": next })),
        "10.0.13.3",
    )
    .await;
    assert_eq!(status.as_u16(), 401);
}

#[tokio::test]
async fn auth_endpoints_are_rate_limited_per_ip() {
    let app = app(2, 120); // budget of 2 per minute per IP
    let email = unique_email("rl");

    // First two register attempts pass; the third is throttled.
    let (s1, _) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": email, "password": "password123" })),
        "10.0.5.1",
    )
    .await;
    let (s2, _) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("rl"), "password": "password123" })),
        "10.0.5.1",
    )
    .await;
    let (s3, body) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("rl"), "password": "password123" })),
        "10.0.5.1",
    )
    .await;
    assert_eq!(s1.as_u16(), 201);
    assert_eq!(s2.as_u16(), 201);
    assert_eq!(s3.as_u16(), 429, "{body}");

    // A different IP is not throttled.
    let (s4, _) = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        Some(json!({ "email": unique_email("rl"), "password": "password123" })),
        "10.0.5.2",
    )
    .await;
    assert_eq!(s4.as_u16(), 201);
}
