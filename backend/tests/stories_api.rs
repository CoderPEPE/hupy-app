//! Story API integration tests: the story library, the completion gate on the
//! pre-generated story, and playback-position saving.

mod common;

use common::{app, pool, register, request, unique_email};
use diesel::connection::SimpleConnection;
use serde_json::json;

/// Writes the pre-generated story a planet would ship with. In production
/// this row comes from the `seed_stories` binary; the tests plant their own
/// so they never depend on a model call.
fn seed_story(planet_id: &str) {
    let mut conn = pool().get().expect("test db connection");
    conn.batch_execute(&format!(
        "INSERT INTO planet_story_seeds \
           (planet_id, title, sentences, translation, duration_secs, source) \
         VALUES ('{planet_id}', 'A Day on Mercury', \
           '[\"I wake up early.\",\"I go to work.\",\"I am happy.\"]', \
           '[\"Acordo cedo.\",\"Vou trabalhar.\",\"Estou feliz.\"]', 42, 'test') \
         ON CONFLICT (planet_id) DO UPDATE SET title = EXCLUDED.title"
    ))
    .expect("seed story");
}

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

/// The story is the reward for finishing the planet: seeded or not, a planet
/// that has not been conquered hands over nothing.
#[tokio::test]
async fn a_locked_planet_withholds_its_seeded_story() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("story-gate")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.42.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    seed_story(&p1);

    let (status, body) =
        request(&app, "GET", "/api/stories", Some(&token), None, "10.0.42.2").await;
    assert_eq!(status.as_u16(), 200, "{body}");
    let entry = body
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["planet"]["id"] == p1.as_str())
        .unwrap()
        .clone();
    assert!(!entry["unlocked"].as_bool().unwrap());
    assert!(
        entry["story"].is_null(),
        "a locked planet must not leak its story: {entry}"
    );
}

#[tokio::test]
async fn a_conquered_planet_plays_its_seeded_story() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("story-play")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.43.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    seed_story(&p1);

    // Conquer planet 1: max every tutor-graded metric, master every sentence
    // and graduate one card (the same honest path the unlock test uses).
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
        assert_eq!(status.as_u16(), 200, "master {} body={body}", s["id"]);
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

    // Sanity: the planet must actually be conquered.
    let (_, check) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.43.8",
    )
    .await;
    assert!(
        check["progress"]["mastery"].as_f64().unwrap() >= 0.8,
        "planet must be conquered first: {check}"
    );

    // No generation step: the seeded story is simply there, ready to play.
    let (_, list) = request(&app, "GET", "/api/stories", Some(&token), None, "10.0.43.9").await;
    let entry = list
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["planet"]["id"] == p1.as_str())
        .unwrap()
        .clone();
    assert!(entry["unlocked"].as_bool().unwrap());
    let story = &entry["story"];
    assert_eq!(story["title"], "A Day on Mercury", "{entry}");
    assert_eq!(story["status"], "ready");
    assert_eq!(story["sentences"].as_array().unwrap().len(), 3);
    assert_eq!(
        story["sentences"].as_array().unwrap().len(),
        story["translation"].as_array().unwrap().len(),
        "translation must align 1:1 with the transcript"
    );
    assert_eq!(story["duration_secs"], 42);
    assert_eq!(story["position_secs"], 0, "nothing listened to yet");

    // Playback progress is persisted against the seed…
    let (status, saved) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/progress"),
        Some(&token),
        Some(json!({ "position_secs": 20, "completed": false })),
        "10.0.43.10",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{saved}");
    assert_eq!(saved["position_secs"], 20);
    assert_eq!(
        saved["sentences"].as_array().unwrap().len(),
        3,
        "the transcript still comes from the seed: {saved}"
    );

    // …and comes back on the next read, so the player resumes.
    let (status, again) = request(
        &app,
        "GET",
        &format!("/api/stories/{p1}"),
        Some(&token),
        None,
        "10.0.43.11",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{again}");
    assert_eq!(again["position_secs"], 20);

    // A second save updates the same bookmark rather than adding a row.
    let (_, finished) = request(
        &app,
        "POST",
        &format!("/api/stories/{p1}/progress"),
        Some(&token),
        Some(json!({ "position_secs": 42, "completed": true })),
        "10.0.43.12",
    )
    .await;
    assert_eq!(finished["position_secs"], 42);
    assert_eq!(finished["completed"], true);
    assert_eq!(finished["id"], story["id"], "the story identity is the seed");
}
