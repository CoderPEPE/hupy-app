//! Flashcard API integration tests: create/list, the SM-2 spaced-repetition
//! review flow, the "easy is a self-report until the tutor confirms live"
//! rule, correction-to-card, and cross-user access control.

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

async fn setup() -> (common::Router, String, String) {
    let app = app(30, 120);
    let email = unique_email("card");
    let token = register(&app, &email).await;
    let (status, body) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({
            "en": "I need help",
            "pt": "Eu preciso de ajuda",
            "explanation": "need + noun",
            "subject": "I",
            "verb": "need",
            "complement": "help",
        })),
        "10.0.20.1",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{body}");
    let card_id = body["id"].as_str().unwrap().to_string();
    (app, token, card_id)
}

#[tokio::test]
async fn review_drives_spaced_repetition() {
    let (app, token, card_id) = setup().await;

    // First review: medium -> 3 days.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "medium" })),
        "10.0.21.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["interval_days"], 3);
    assert_eq!(body["last_rating"], "medium");
    assert_eq!(body["repetitions"], 1);
    assert!(
        !body["due"].as_bool().unwrap(),
        "a card 3 days out must not be due"
    );

    // Easy on the next review grows the interval and the ease factor.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "easy" })),
        "10.0.21.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["interval_days"], 10); // 3 * 2.5 * 1.3 = 9.75 -> 10
    assert_eq!(body["repetitions"], 2);

    // Hard shrinks it again.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "hard" })),
        "10.0.21.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert_eq!(body["interval_days"], 5); // 10 * 0.5 = 5
}

#[tokio::test]
async fn easy_is_not_trusted_until_the_tutor_confirms_live() {
    let (app, token, card_id) = setup().await;

    // Rating easy sets verified_live = false (self-report alone never counts).
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "easy" })),
        "10.0.22.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert!(!body["verified_live"].as_bool().unwrap());

    // The tutor's live re-test flips the flag.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/confirm-live-mastery"),
        Some(&token),
        None,
        "10.0.22.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{body}");
    assert!(body["verified_live"].as_bool().unwrap());
}

#[tokio::test]
async fn due_filter_and_invalid_ratings() {
    let (app, token, card_id) = setup().await;

    // Fresh card is due now.
    let (status, list) = request(
        &app,
        "GET",
        "/api/flashcards?due=true",
        Some(&token),
        None,
        "10.0.23.1",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{list}");
    assert_eq!(list.as_array().unwrap().len(), 1);

    // After a medium review it leaves the due list.
    request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "medium" })),
        "10.0.23.2",
    )
    .await;
    let (_, list) = request(
        &app,
        "GET",
        "/api/flashcards?due=true",
        Some(&token),
        None,
        "10.0.23.3",
    )
    .await;
    assert_eq!(list.as_array().unwrap().len(), 0);

    // Unknown rating rejected.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "trivial" })),
        "10.0.23.4",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");
}

#[tokio::test]
async fn cards_are_private_and_creation_is_validated() {
    let (app, _token_a, card_id) = setup().await;
    let token_b = register(&app, &unique_email("card-b")).await;

    // B cannot review or delete A's card.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token_b),
        Some(json!({ "rating": "easy" })),
        "10.0.24.1",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    let (status, body) = request(
        &app,
        "DELETE",
        &format!("/api/flashcards/{card_id}"),
        Some(&token_b),
        None,
        "10.0.24.2",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    // Oversized fields on create.
    let (status, body) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token_b),
        Some(json!({ "en": "x".repeat(513), "pt": "y" })),
        "10.0.24.3",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    let (status, body) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token_b),
        Some(json!({ "en": "I work", "pt": "Eu trabalho", "source": "s".repeat(33) })),
        "10.0.24.4",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");
}

#[tokio::test]
async fn correction_becomes_a_card() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("corr2card")).await;

    // A conversation with a correction.
    let (_, conv) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.25.2",
    )
    .await;
    let conv_id = conv["id"].as_str().unwrap().to_string();
    let (_, corr) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/corrections"),
        Some(&token),
        Some(json!({
            "said": "I come fix the table",
            "corrected": "I came to fix the table",
            "explanation": "Past tense of come is came.",
            "pt": "Eu vim consertar a mesa.",
        })),
        "10.0.25.3",
    )
    .await;
    let corr_id = corr["id"].as_str().unwrap().to_string();

    // "Make a card" inherits en/pt/explanation from the correction.
    let (status, card) = request(
        &app,
        "POST",
        &format!("/api/flashcards/corrections/{corr_id}/flashcard"),
        Some(&token),
        None,
        "10.0.25.4",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{card}");
    assert_eq!(card["en"], "I came to fix the table");
    assert_eq!(card["pt"], "Eu vim consertar a mesa.");
    assert_eq!(card["source"], "correction");
}
