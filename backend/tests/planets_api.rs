//! Planet API integration tests: course-scoped listing, public catalog
//! counts, detail, the tutor-graded progress bumps (including the delta cap
//! added during the security audit), sentence mastery, and the unlock chain.

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

async fn setup() -> (common::Router, String) {
    let app = app(30, 120);
    let email = unique_email("planet");
    let token = register(&app, &email).await;
    (app, token)
}

#[tokio::test]
async fn list_is_scoped_to_the_users_course() {
    let (app, token) = setup().await;

    let (status, planets) =
        request(&app, "GET", "/api/planets", Some(&token), None, "10.0.30.1").await;
    assert_eq!(status.as_u16(), 200, "{planets}");
    let planets = planets.as_array().unwrap();

    assert!(!planets.is_empty());
    // The default course is (pt, en).
    assert_eq!(planets[0]["base_language"], "pt");
    assert_eq!(planets[0]["language"], "en");
    // First planet open, the rest locked behind it.
    assert_eq!(planets[0]["status"], "available");
    for p in planets.iter().skip(1) {
        assert_eq!(
            p["status"], "locked",
            "planet {} must start locked",
            p["number"]
        );
    }
}

#[tokio::test]
async fn catalog_counts_are_public_and_course_scoped() {
    let (status, catalog) = request(
        &app(30, 120),
        "GET",
        "/api/planets/catalog?language=en&base_language=pt",
        None,
        None,
        "10.0.31.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{catalog}");
    assert!(catalog["planets"].as_i64().unwrap() >= 8, "{catalog}");
    assert!(catalog["sentences"].as_i64().unwrap() >= 200, "{catalog}");
    assert!(catalog["lessons"].as_i64().unwrap() >= 32, "{catalog}");
}

#[tokio::test]
async fn detail_returns_sentences_and_lesson_path() {
    let (app, token) = setup().await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.32.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();

    let (status, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{planet_id}"),
        Some(&token),
        None,
        "10.0.32.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{detail}");
    assert!(
        detail["sentences"].as_array().unwrap().len() >= 40,
        "{detail}"
    );
    // The ten-module path: the learner is on module 1, everything after it is
    // locked behind the conversation + flashcards gate.
    assert_eq!(detail["lessons"].as_array().unwrap().len(), 10);
    assert_eq!(detail["lessons"][0]["kind"], "context");
    assert_eq!(detail["lessons"][0]["state"], "current");
    assert_eq!(detail["lessons"][1]["state"], "locked");
    // Every block names the skill its review would drill.
    assert_eq!(detail["lessons"][4]["skill"], "listening");
    assert_eq!(detail["level"], "A1");
    assert_eq!(detail["completed_blocks"], 0);
    assert_eq!(detail["total_blocks"], 10);
}

#[tokio::test]
async fn progress_bumps_are_tutor_graded_and_capped() {
    let (app, token) = setup().await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.33.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();

    // A tutor-sized bump lands.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/progress"),
        Some(&token),
        Some(json!({ "metric": "pronunciation", "delta": 0.1 })),
        "10.0.33.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert!((body["progress"]["pronunciation"].as_f64().unwrap() - 0.1).abs() < 1e-9);
    assert!((body["progress"]["mastery"].as_f64().unwrap() - 0.1 / 6.0).abs() < 1e-9);

    // Unknown metric rejected.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/progress"),
        Some(&token),
        Some(json!({ "metric": "mastery", "delta": 0.1 })),
        "10.0.33.3",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // A non-number delta cannot even deserialize — the Json extractor rejects
    // it with 422 before the handler's is_finite() guard (defense-in-depth
    // for serializers that could emit a literal NaN) is reached.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/progress"),
        Some(&token),
        Some(json!({ "metric": "review", "delta": "nan" })),
        "10.0.33.4",
    )
    .await;
    assert_eq!(status.as_u16(), 422, "{body}");

    // The old ±1.0 cheat vector is now rejected outright.
    for delta in [1.0, -1.0, 0.2] {
        let (status, body) = request(
            &app,
            "POST",
            &format!("/api/planets/{planet_id}/progress"),
            Some(&token),
            Some(json!({ "metric": "conversation", "delta": delta })),
            "10.0.33.5",
        )
        .await;
        assert_eq!(status.as_u16(), 400, "delta {delta}: {body}");
    }

    // Unknown planet -> clean 404 (not a DB 500).
    let (status, body) = request(
        &app,
        "POST",
        "/api/planets/00000000-0000-0000-0000-000000000000/progress",
        Some(&token),
        Some(json!({ "metric": "review", "delta": 0.1 })),
        "10.0.33.6",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");
}

#[tokio::test]
async fn mastering_sentences_moves_the_sentences_metric() {
    let (app, token) = setup().await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.34.1").await;
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{planet_id}"),
        Some(&token),
        None,
        "10.0.34.2",
    )
    .await;
    let sentence_id = detail["sentences"][0]["id"].as_str().unwrap().to_string();
    let total = detail["sentences"].as_array().unwrap().len();

    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/sentences/{sentence_id}/master"),
        Some(&token),
        Some(json!({ "mastered": true })),
        "10.0.34.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["mastered_sentences"], 1);
    assert_eq!(body["total_sentences"], total as i64);
    assert!((body["progress"]["sentences"].as_f64().unwrap() - 1.0 / total as f64).abs() < 1e-9);

    // A sentence from another planet is not found in this one.
    let planet2 = planets[1]["id"].as_str().unwrap().to_string();
    let (_, detail2) = request(
        &app,
        "GET",
        &format!("/api/planets/{planet2}"),
        Some(&token),
        None,
        "10.0.34.4",
    )
    .await;
    let foreign_sentence = detail2["sentences"][0]["id"].as_str().unwrap().to_string();
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/planets/{planet_id}/sentences/{foreign_sentence}/master"),
        Some(&token),
        Some(json!({ "mastered": true })),
        "10.0.34.5",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");
}

#[tokio::test]
async fn completing_planet_one_unlocks_planet_two() {
    let (app, token) = setup().await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.35.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let p2 = planets[1]["id"].as_str().unwrap().to_string();

    // Mastery is the average of six metrics and the unlock threshold is 0.8
    // (seeded), so "complete planet 1" means honest work on every metric:
    // the four tutor-graded bumps (0.03–0.15 each, so the delta cap is
    // exercised end-to-end), every sentence mastered, and one graduated card.
    for metric in ["pronunciation", "conversation", "listening", "review"] {
        let mut remaining: f64 = 0.8;
        while remaining > 0.0 {
            let delta = remaining.min(0.15);
            let (status, body) = request(
                &app,
                "POST",
                &format!("/api/planets/{p1}/progress"),
                Some(&token),
                Some(json!({ "metric": metric, "delta": delta })),
                "10.0.35.2",
            )
            .await;
            assert_eq!(status.as_u16(), 200, "{metric} {delta}: {body}");
            remaining -= delta;
        }
    }

    // Master every sentence of planet 1.
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.35.3",
    )
    .await;
    for s in detail["sentences"].as_array().unwrap() {
        let sid = s["id"].as_str().unwrap();
        let (status, _) = request(
            &app,
            "POST",
            &format!("/api/planets/{p1}/sentences/{sid}/master"),
            Some(&token),
            Some(json!({ "mastered": true })),
            "10.0.35.4",
        )
        .await;
        assert_eq!(status.as_u16(), 200);
    }

    // One graduated card *on planet 1* (reviewed easy, then confirmed live)
    // fills the planet's flashcards metric — the metric is scoped to the
    // card's planet_id.
    let (_, card) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({ "en": "I need help", "pt": "Eu preciso de ajuda", "planet_id": p1 })),
        "10.0.35.5",
    )
    .await;
    let card_id = card["id"].as_str().unwrap().to_string();
    request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "easy" })),
        "10.0.35.6",
    )
    .await;
    let (status, _) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/confirm-live-mastery"),
        Some(&token),
        None,
        "10.0.35.7",
    )
    .await;
    assert_eq!(status.as_u16(), 200);

    // Every metric is now >= 0.8 (mastery ~0.87) — and that is deliberately
    // NOT enough any more. The planet is earned by working through its ten
    // modules, so planet 2 stays shut.
    let (status, body) = request(
        &app,
        "GET",
        &format!("/api/planets/{p2}"),
        Some(&token),
        None,
        "10.0.35.8",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(
        body["status"], "locked",
        "a high mastery average must not open the next planet: {body}"
    );

    // Work through planet 1's ten modules — the real gate.
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.35.9",
    )
    .await;
    for module in detail["lessons"].as_array().unwrap() {
        // Mastering every sentence above already closed the first module —
        // that is the sentence-taught fallback path, and it closes *both*
        // halves, so this module is done and is no longer the current one.
        // Only the modules still open need driving here.
        if module["state"] == "completed" {
            continue;
        }
        let id = module["id"].as_str().unwrap();
        let (status, body) = request(
            &app,
            "POST",
            &format!("/api/modules/{id}/complete-conversation"),
            Some(&token),
            None,
            "10.0.35.10",
        )
        .await;
        assert_eq!(status.as_u16(), 200, "{body}");
    }

    let (status, body) = request(
        &app,
        "GET",
        &format!("/api/planets/{p2}"),
        Some(&token),
        None,
        "10.0.35.11",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["status"], "available", "{body}");
}

/// A module taught from the planet's sentence list (no authored structures)
/// completes when every sentence is mastered — and must close *both* halves.
///
/// Regression: it used to close only the conversation half. A module that
/// minted no corrections has an empty deck, so nothing could ever set
/// `flashcards_done`, and the module — and with it the planet — stayed
/// permanently unfinishable.
#[tokio::test]
async fn mastering_every_sentence_closes_both_halves_of_the_module() {
    let (app, token) = setup().await;

    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.36.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();

    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.36.2",
    )
    .await;
    let first_module = detail["lessons"][0]["id"].as_str().unwrap().to_string();

    for s in detail["sentences"].as_array().unwrap() {
        let sid = s["id"].as_str().unwrap();
        let (status, _) = request(
            &app,
            "POST",
            &format!("/api/planets/{p1}/sentences/{sid}/master"),
            Some(&token),
            Some(json!({ "mastered": true })),
            "10.0.36.3",
        )
        .await;
        assert_eq!(status.as_u16(), 200);
    }

    let (status, after) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.36.4",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{after}");

    let module = after["lessons"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"].as_str() == Some(first_module.as_str()))
        .expect("the module we mastered is still listed");
    assert_eq!(
        module["state"], "completed",
        "mastering every sentence must finish the module outright, not strand \
         it with an un-closable empty flashcard deck: {module}"
    );
}
