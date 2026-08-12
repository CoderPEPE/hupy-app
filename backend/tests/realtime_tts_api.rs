//! Realtime / TTS / voices / health integration tests.
//!
//! The OpenAI API key is intentionally empty in the test config, so the
//! realtime client-secret and TTS handlers take their "not configured"
//! path — no network calls ever leave the machine. What these tests pin
//! down is the auth gate, the validation surface, and the rate limits
//! around the money-burning endpoints.

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

#[tokio::test]
async fn health_is_public() {
    let (status, body) = request(&app(30, 120), "GET", "/health", None, None, "10.0.50.1").await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body, json!("ok"));
}

#[tokio::test]
async fn realtime_client_secret_requires_auth_and_config() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("rt")).await;

    // No token -> 401 before anything else.
    let (status, body) = request(&app, "POST", "/api/realtime/client-secret", None, None, "10.0.51.1").await;
    assert_eq!(status.as_u16(), 401, "{body}");

    // Authenticated, but the server has no OPENAI_API_KEY -> clean 500 that
    // names the missing configuration (never a panic, never a leak).
    let (status, body) =
        request(&app, "POST", "/api/realtime/client-secret", Some(&token), None, "10.0.51.2").await;
    assert_eq!(status.as_u16(), 500, "{body}");
    assert!(body["error"].as_str().unwrap().contains("OPENAI_API_KEY"), "{body}");
}

#[tokio::test]
async fn realtime_client_secret_is_rate_limited() {
    let app = app(2, 120); // budget of 2 per minute per IP
    let token = register(&app, &unique_email("rt-rl")).await;

    for i in 1..=3 {
        let (status, body) = request(
            &app,
            "POST",
            "/api/realtime/client-secret",
            Some(&token),
            None,
            "10.0.52.1",
        )
        .await;
        if i <= 2 {
            assert_eq!(status.as_u16(), 500, "minting without a key: {body}");
        } else {
            assert_eq!(status.as_u16(), 429, "third mint must be throttled: {body}");
        }
    }
}

#[tokio::test]
async fn tts_validates_input_and_is_rate_limited() {
    let app = app(30, 2); // budget of 2 per minute per IP
    let token = register(&app, &unique_email("tts")).await;

    // Empty text -> 400.
    let (status, body) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "   " })),
        "10.0.53.1",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Oversized text -> 400.
    let (status, body) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "x".repeat(4097) })),
        "10.0.53.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Without a token -> 401.
    let (status, body) = request(
        &app,
        "POST",
        "/api/tts",
        None,
        Some(json!({ "text": "Good morning" })),
        "10.0.53.3",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");

    // Oversized voice id -> 400 (the cap added during the security audit).
    let (status, body) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "Hello", "voice": "v".repeat(65) })),
        "10.0.53.4",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // The two budgeted requests pass the limiter (and hit the no-key 500)…
    let (s1, _) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "Good morning" })),
        "10.0.53.5",
    )
    .await;
    let (s2, _) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "Good night" })),
        "10.0.53.5",
    )
    .await;
    // …and the third is throttled.
    let (s3, body) = request(
        &app,
        "POST",
        "/api/tts",
        Some(&token),
        Some(json!({ "text": "Hello" })),
        "10.0.53.5",
    )
    .await;
    assert_eq!(s1.as_u16(), 500, "no key configured");
    assert_eq!(s2.as_u16(), 500);
    assert_eq!(s3.as_u16(), 429, "{body}");
}

#[tokio::test]
async fn voices_catalog_serves_the_seeded_voices() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("voice")).await;

    let (status, voices) = request(&app, "GET", "/api/voices", Some(&token), None, "10.0.54.1").await;
    assert_eq!(status.as_u16(), 200, "{voices}");
    let voices = voices.as_array().unwrap();
    assert!(voices.len() >= 10, "{voices:?}");
    assert!(voices.iter().any(|v| v["id"] == "marin"), "{voices:?}");
}
