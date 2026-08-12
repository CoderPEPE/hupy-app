//! Per-IP rate-limit integration tests for the learning write endpoints.
//!
//! Conversations, flashcards and planets mutations share ONE write budget per
//! socket IP (see `WRITE_RATE_MAX` / `WRITE_RATE_WINDOW_SECS`), so abuse
//! that hops between endpoints still hits the same cap. Read endpoints are
//! deliberately not throttled.

mod common;

use common::{app_with_limits, register, request, unique_email};
use serde_json::json;

#[tokio::test]
async fn conversation_writes_are_throttled_after_the_budget() {
    let app = app_with_limits(30, 120, 2); // write budget of 2 per minute per IP
    let token = register(&app, &unique_email("wrt-conv")).await;

    for i in 1..=3 {
        let (status, body) = request(
            &app,
            "POST",
            "/api/conversations",
            Some(&token),
            Some(json!({})),
            "10.0.90.1",
        )
        .await;
        if i <= 2 {
            assert_eq!(status.as_u16(), 201, "create #{i}: {body}");
        } else {
            assert_eq!(
                status.as_u16(),
                429,
                "third create must be throttled: {body}"
            );
        }
    }
}

#[tokio::test]
async fn reads_are_not_throttled_and_other_ips_keep_their_own_budget() {
    let app = app_with_limits(30, 120, 1); // write budget of 1 per minute per IP
    let token = register(&app, &unique_email("wrt-reads")).await;

    // Exhaust IP A's write budget.
    let (s1, _) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.91.1",
    )
    .await;
    assert_eq!(s1.as_u16(), 201);
    let (s2, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.91.1",
    )
    .await;
    assert_eq!(s2.as_u16(), 429, "second write from the same IP: {body}");

    // Reads from the same IP are unaffected — the app polls these on every
    // screen visit and must never be cut off by write throttling.
    let (s3, _) = request(
        &app,
        "GET",
        "/api/conversations",
        Some(&token),
        None,
        "10.0.91.1",
    )
    .await;
    assert_eq!(s3.as_u16(), 200, "reads must not be throttled");
    let (s4, _) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.91.1").await;
    assert_eq!(s4.as_u16(), 200, "planet list must not be throttled");

    // A different IP has its own budget.
    let (s5, _) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.91.2",
    )
    .await;
    assert_eq!(s5.as_u16(), 201, "a fresh IP must be unaffected");
}

#[tokio::test]
async fn all_write_endpoints_share_one_budget() {
    let app = app_with_limits(30, 120, 2); // write budget of 2 per minute per IP
    let token = register(&app, &unique_email("wrt-shared")).await;

    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.92.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();

    // Two writes across different domains exhaust the shared budget…
    let (s1, _) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.92.1",
    )
    .await;
    assert_eq!(s1.as_u16(), 201);
    let (s2, _) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({ "en": "Hello", "pt": "Olá" })),
        "10.0.92.1",
    )
    .await;
    assert_eq!(s2.as_u16(), 201);

    // …so a third write from a third domain is throttled too.
    let (s3, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/progress"),
        Some(&token),
        Some(json!({ "metric": "pronunciation", "delta": 0.1 })),
        "10.0.92.1",
    )
    .await;
    assert_eq!(
        s3.as_u16(),
        429,
        "planets write must share the budget: {body}"
    );
}

#[tokio::test]
async fn delete_and_flashcard_review_are_throttled_too() {
    let app = app_with_limits(30, 120, 2); // write budget of 2 per minute per IP
    let token = register(&app, &unique_email("wrt-del")).await;

    let (_, conv) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.94.1",
    )
    .await;
    let conv_id = conv["id"].as_str().unwrap().to_string();
    let (_, card) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({ "en": "Hello", "pt": "Olá" })),
        "10.0.94.1",
    )
    .await;
    let card_id = card["id"].as_str().unwrap().to_string();

    // Both budgeted writes are used up — the next two writes from the same
    // IP (a DELETE and a review) must be throttled.
    let (s1, body) = request(
        &app,
        "DELETE",
        &format!("/api/conversations/{conv_id}"),
        Some(&token),
        None,
        "10.0.94.1",
    )
    .await;
    assert_eq!(s1.as_u16(), 429, "DELETE must be throttled: {body}");
    let (s2, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "easy" })),
        "10.0.94.1",
    )
    .await;
    assert_eq!(
        s2.as_u16(),
        429,
        "flashcard review must be throttled: {body}"
    );
}

#[tokio::test]
async fn planets_progress_and_sentence_mastery_are_throttled() {
    let app = app_with_limits(30, 120, 1); // write budget of 1 per minute per IP
    let token = register(&app, &unique_email("wrt-planets")).await;

    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.93.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{planet_id}"),
        Some(&token),
        None,
        "10.0.93.1",
    )
    .await;
    let sentence_id = detail["sentences"][0]["id"].as_str().unwrap().to_string();

    // The budgeted write goes through…
    let (s1, _) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/progress"),
        Some(&token),
        Some(json!({ "metric": "pronunciation", "delta": 0.1 })),
        "10.0.93.1",
    )
    .await;
    assert_eq!(s1.as_u16(), 200);

    // …and the next one (this time a sentence master) is throttled.
    let (s2, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/sentences/{sentence_id}/master"),
        Some(&token),
        Some(json!({ "mastered": true })),
        "10.0.93.1",
    )
    .await;
    assert_eq!(
        s2.as_u16(),
        429,
        "sentence mastery must share the budget: {body}"
    );
}
