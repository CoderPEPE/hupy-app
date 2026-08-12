//! Auth API integration tests: registration, login, session (`/me`), course
//! and voice settings, and the per-IP brute-force rate limit.

mod common;

use common::{app, register, request, unique_email, TEST_SECRET};
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
        (json!({ "email": email, "password": "wrong-password" }), "10.0.2.1"),
        (json!({ "email": unique_email("ghost"), "password": "password123" }), "10.0.2.2"),
    ] {
        let (status, resp) = request(&app, "POST", "/api/auth/login", None, Some(body), ip).await;
        assert_eq!(status.as_u16(), 401, "{resp}");
        assert!(resp["error"].as_str().unwrap().contains("Invalid email or password"));
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

    let (status, body) =
        request(&app, "GET", "/api/auth/me", Some("garbage.token.here"), None, "10.0.3.2").await;
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
    let (status, body) =
        request(&app, "GET", "/api/auth/me", Some(&expired), None, "10.0.3.3").await;
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
