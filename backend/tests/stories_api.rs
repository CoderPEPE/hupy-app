//! Story API integration tests: the story library, the completion-gated
//! generation, the personalized transcript, and playback-position saving.

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

#[tokio::test]
async fn story_library_starts_locked_and_empty() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("story-lib")).await;

    let (status, body) =
        request(&app, "GET", "/api/stories", Some(&token), None, "10.0.41.1").await;
    assert_eq!(status.as_u16(), 200, "{body}");
    let list = body.as_array().unwrap();
    assert_eq!(
        list.len(),
        60,
        "the full 60-planet journey is listed: {body}"
    );
    assert!(!list[0]["unlocked"].as_bool().unwrap());
    assert!(list[0]["story"].is_null());
    assert_eq!(list[0]["planet"]["level"], "A1");
    assert_eq!(list[59]["planet"]["level"], "C1");
}

#[tokio::test]
async fn story_generation_requires_a_conquered_planet() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("story-gate")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.42.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();

    // A fresh account has not conquered anything yet.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/generate"),
        Some(&token),
        None,
        "10.0.42.2",
    )
    .await;
    assert_eq!(status.as_u16(), 409, "{body}");
}

#[tokio::test]
async fn conquered_planet_generates_a_personalized_story() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("story-gen")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.43.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();

    // Conquer planet 1: max every tutor-graded metric, master every sentence
    // and graduate one card (same honest path the unlock test uses).
    for metric in ["pronunciation", "conversation", "listening", "review"] {
        for _ in 0..6 {
            request(
                &app,
                "POST",
                &format!("/api/planets/{p1}/progress"),
                Some(&token),
                Some(json!({ "metric": metric, "delta": 0.15 })),
                "10.0.43.2",
            )
            .await;
        }
    }
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.43.3",
    )
    .await;
    for s in detail["sentences"].as_array().unwrap() {
        let sid = s["id"].as_str().unwrap();
        let (status, body) = request(
            &app,
            "POST",
            &format!("/api/planets/{p1}/sentences/{sid}/master"),
            Some(&token),
            Some(json!({ "mastered": true })),
            "10.0.43.4",
        )
        .await;
        assert_eq!(
            status.as_u16(),
            200,
            "master {} status={} body={body}",
            s["id"],
            status.as_u16()
        );
    }
    let (_, card) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({ "en": "I need help", "pt": "Eu preciso de ajuda", "planet_id": p1 })),
        "10.0.43.5",
    )
    .await;
    let card_id = card["id"].as_str().unwrap().to_string();
    request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "easy" })),
        "10.0.43.6",
    )
    .await;
    let (status, confirm) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/confirm-live-mastery"),
        Some(&token),
        None,
        "10.0.43.7",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{confirm}");

    // Sanity: the planet must actually be conquered before generating.
    let (_, check) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.43.12",
    )
    .await;
    assert!(
        check["progress"]["mastery"].as_f64().unwrap() >= 0.8,
        "planet must be conquered first: {check}"
    );

    // The planet is now conquered and the story can be generated.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/generate"),
        Some(&token),
        None,
        "10.0.43.8",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert!(body["sentences"].as_array().unwrap().len() >= 3, "{body}");
    assert_eq!(
        body["sentences"].as_array().unwrap().len(),
        body["translation"].as_array().unwrap().len(),
        "translation must align 1:1 with the transcript"
    );
    assert!(body["duration_secs"].as_i64().unwrap() > 0, "{body}");
    assert!(body["position_secs"].as_i64().unwrap() == 0, "{body}");

    // The story appears in the library for this planet, unlocked.
    let (_, list) = request(&app, "GET", "/api/stories", Some(&token), None, "10.0.43.9").await;
    let entry = list
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["planet"]["id"] == p1.as_str())
        .unwrap();
    assert!(entry["unlocked"].as_bool().unwrap());
    assert!(!entry["story"].is_null());

    // Playback progress is persisted and returned.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/progress"),
        Some(&token),
        Some(json!({ "position_secs": 45, "completed": false })),
        "10.0.43.10",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["position_secs"], 45);

    // Regeneration is idempotent (upsert, not a second row).
    let (status, body2) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/generate"),
        Some(&token),
        None,
        "10.0.43.11",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body2}");
    assert_eq!(
        body2["id"], body["id"],
        "regeneration must reuse the same story row"
    );
}
