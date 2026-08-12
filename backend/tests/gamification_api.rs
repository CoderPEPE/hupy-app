//! Gamification API integration tests: XP accrues only from real learning
//! events (there is deliberately no client-triggered XP endpoint), streaks
//! advance once per calendar day, and achievements pay out when their
//! thresholds are met.

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

async fn setup() -> (common::Router, String) {
    let app = app(30, 120);
    let email = unique_email("game");
    let token = register(&app, &email).await;
    (app, token)
}

#[tokio::test]
async fn fresh_users_start_at_zero() {
    let (app, token) = setup().await;
    let (status, stats) = request(
        &app,
        "GET",
        "/api/gamification/stats",
        Some(&token),
        None,
        "10.0.40.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{stats}");
    assert_eq!(stats["xp"], 0);
    assert_eq!(stats["streak_days"], 0);
    assert_eq!(stats["earned_count"], 0);
    assert!(
        stats["total_count"].as_u64().unwrap() >= 100,
        "the 100-achievement catalog is seeded"
    );
    // Every achievement renders with a progress bar and no earned_at.
    for a in stats["achievements"].as_array().unwrap() {
        assert!(a["earned_at"].is_null());
        assert!(a["threshold"].as_i64().unwrap() > 0);
    }
}

#[tokio::test]
async fn real_activities_earn_xp_and_an_achievement() {
    let (app, token) = setup().await;

    // A conversation + correction (the "first correction" achievement has
    // threshold 1, so this must pay out and add its XP reward).
    let (_, conv) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.41.1",
    )
    .await;
    let conv_id = conv["id"].as_str().unwrap().to_string();
    let (status, _) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/corrections"),
        Some(&token),
        Some(json!({ "said": "I go to work", "corrected": "I went to work", "explanation": "past tense" })),
        "10.0.41.2",
    )
    .await;
    assert_eq!(status.as_u16(), 201);

    let (status, stats) = request(
        &app,
        "GET",
        "/api/gamification/stats",
        Some(&token),
        None,
        "10.0.41.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{stats}");
    assert!(
        stats["xp"].as_i64().unwrap() >= 3,
        "correction awards XP: {stats}"
    );
    assert_eq!(
        stats["streak_days"], 1,
        "activity today starts the streak: {stats}"
    );
    assert!(
        stats["earned_count"].as_u64().unwrap() >= 1,
        "first-correction badge earned: {stats}"
    );

    // The earned badge shows an earned_at and full progress.
    let badges = stats["badges"].as_array().unwrap();
    assert!(!badges.is_empty());
    assert!(badges[0]["earned_at"].is_string());
}

#[tokio::test]
async fn mastering_the_same_sentence_twice_pays_xp_once() {
    let (app, token) = setup().await;

    // Find the first planet + its first sentence.
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.44.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{planet_id}"),
        Some(&token),
        None,
        "10.0.44.2",
    )
    .await;
    let sentence_id = detail["sentences"][0]["id"].as_str().unwrap().to_string();

    // Master it once, snapshot XP, then master it again — the repeat must
    // not pay the 8 XP again (the first mastery may also trigger an
    // achievement bonus, so compare against the snapshot, not an absolute
    // number).
    let (status, _) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/sentences/{sentence_id}/master"),
        Some(&token),
        Some(json!({ "mastered": true })),
        "10.0.44.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200);

    let (_, before) = request(
        &app,
        "GET",
        "/api/gamification/stats",
        Some(&token),
        None,
        "10.0.44.4",
    )
    .await;
    let xp_before = before["xp"].as_i64().unwrap();

    let (status, _) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/sentences/{sentence_id}/master"),
        Some(&token),
        Some(json!({ "mastered": true })),
        "10.0.44.5",
    )
    .await;
    assert_eq!(status.as_u16(), 200);

    let (_, after) = request(
        &app,
        "GET",
        "/api/gamification/stats",
        Some(&token),
        None,
        "10.0.44.6",
    )
    .await;
    assert_eq!(
        after["xp"].as_i64().unwrap(),
        xp_before,
        "re-mastering the same sentence must not farm XP: {after}"
    );
}

#[tokio::test]
async fn same_day_activity_does_not_double_the_streak() {
    let (app, token) = setup().await;

    // Two separate learning events on the same calendar day.
    for i in 0..2 {
        let (_, conv) = request(
            &app,
            "POST",
            "/api/conversations",
            Some(&token),
            Some(json!({})),
            &format!("10.0.42.{}", 1 + i),
        )
        .await;
        let conv_id = conv["id"].as_str().unwrap().to_string();
        request(
            &app,
            "POST",
            &format!("/api/conversations/{conv_id}/corrections"),
            Some(&token),
            Some(json!({ "said": "a", "corrected": "b", "explanation": "c" })),
            &format!("10.0.42.{}", 3 + i),
        )
        .await;
    }

    let (_, stats) = request(
        &app,
        "GET",
        "/api/gamification/stats",
        Some(&token),
        None,
        "10.0.42.5",
    )
    .await;
    assert_eq!(stats["streak_days"], 1, "one day, one streak: {stats}");
    assert!(
        stats["xp"].as_i64().unwrap() >= 6,
        "both corrections paid out: {stats}"
    );
}

#[tokio::test]
async fn stats_requires_authentication() {
    let (status, body) = request(
        &app(30, 120),
        "GET",
        "/api/gamification/stats",
        None,
        None,
        "10.0.43.1",
    )
    .await;
    assert_eq!(status.as_u16(), 401, "{body}");
}
