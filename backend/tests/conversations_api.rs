//! Conversation API integration tests: create/list/detail/delete, messages,
//! corrections — and the ownership rule: another user's conversation is
//! indistinguishable from a missing one (404, never a leak).

mod common;

use common::{app, register, request, unique_email};
use serde_json::json;

async fn setup() -> (common::Router, String) {
    let app = app(30, 120);
    let email = unique_email("conv");
    let token = register(&app, &email).await;
    (app, token)
}

#[tokio::test]
async fn create_list_detail_delete_lifecycle() {
    let (app, token) = setup().await;

    let (status, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({ "title": "My first chat" })),
        "10.0.10.1",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{body}");
    let conv_id = body["id"].as_str().unwrap().to_string();

    // List shows it with zero messages.
    let (status, list) = request(
        &app,
        "GET",
        "/api/conversations",
        Some(&token),
        None,
        "10.0.10.2",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{list}");
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["message_count"], 0);

    // Add a user message and an assistant reply.
    for (role, text) in [("user", "I work every day."), ("assistant", "Very good!")] {
        let (status, _) = request(
            &app,
            "POST",
            &format!("/api/conversations/{conv_id}/messages"),
            Some(&token),
            Some(json!({ "role": role, "text": text })),
            "10.0.10.3",
        )
        .await;
        assert_eq!(status.as_u16(), 201, "role {role}");
    }

    // A correction lands in the detail view too.
    let (status, _) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/corrections"),
        Some(&token),
        Some(json!({
            "said": "I work every day.",
            "corrected": "I work every day.",
            "explanation": "Perfect!",
            "pt": "Eu trabalho todos os dias.",
        })),
        "10.0.10.4",
    )
    .await;
    assert_eq!(status.as_u16(), 201);

    let (status, detail) = request(
        &app,
        "GET",
        &format!("/api/conversations/{conv_id}"),
        Some(&token),
        None,
        "10.0.10.5",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{detail}");
    assert_eq!(detail["messages"].as_array().unwrap().len(), 2);
    assert_eq!(detail["corrections"].as_array().unwrap().len(), 1);
    assert_eq!(detail["corrections"][0]["corrected"], "I work every day.");

    // Delete and confirm it's gone.
    let (status, _) = request(
        &app,
        "DELETE",
        &format!("/api/conversations/{conv_id}"),
        Some(&token),
        None,
        "10.0.10.6",
    )
    .await;
    assert_eq!(status.as_u16(), 204);
    let (status, _) = request(
        &app,
        "GET",
        &format!("/api/conversations/{conv_id}"),
        Some(&token),
        None,
        "10.0.10.7",
    )
    .await;
    assert_eq!(status.as_u16(), 404);
}

#[tokio::test]
async fn conversations_are_private_to_their_owner() {
    let (app, token_a) = setup().await;
    let token_b = register(&app, &unique_email("conv-b")).await;

    let (status, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token_a),
        Some(json!({ "title": "Private to A" })),
        "10.0.11.1",
    )
    .await;
    assert_eq!(status.as_u16(), 201);
    let conv_id = body["id"].as_str().unwrap().to_string();

    // B cannot read, message, correct, or delete A's conversation.
    let (status, body) = request(
        &app,
        "GET",
        &format!("/api/conversations/{conv_id}"),
        Some(&token_b),
        None,
        "10.0.11.2",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/messages"),
        Some(&token_b),
        Some(json!({ "role": "user", "text": "pwned?" })),
        "10.0.11.3",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/corrections"),
        Some(&token_b),
        Some(json!({ "said": "x", "corrected": "y", "explanation": "z" })),
        "10.0.11.4",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    let (status, body) = request(
        &app,
        "DELETE",
        &format!("/api/conversations/{conv_id}"),
        Some(&token_b),
        None,
        "10.0.11.5",
    )
    .await;
    assert_eq!(status.as_u16(), 404, "{body}");

    // A's list still contains exactly one conversation, unmodified.
    let (status, list) = request(
        &app,
        "GET",
        "/api/conversations",
        Some(&token_a),
        None,
        "10.0.11.6",
    )
    .await;
    assert_eq!(status.as_u16(), 200);
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["title"], "Private to A");
}

#[tokio::test]
async fn message_validation() {
    let (app, token) = setup().await;
    let (_, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({})),
        "10.0.12.1",
    )
    .await;
    let conv_id = body["id"].as_str().unwrap().to_string();

    // Invalid role.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/messages"),
        Some(&token),
        Some(json!({ "role": "admin", "text": "hello" })),
        "10.0.12.2",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Empty text.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/messages"),
        Some(&token),
        Some(json!({ "role": "user", "text": "   " })),
        "10.0.12.3",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Oversized text.
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/messages"),
        Some(&token),
        Some(json!({ "role": "user", "text": "x".repeat(4001) })),
        "10.0.12.4",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Oversized kind (the cap added during the security audit).
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/conversations/{conv_id}/messages"),
        Some(&token),
        Some(json!({ "role": "user", "text": "hello", "kind": "x".repeat(65) })),
        "10.0.12.5",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // Oversized title on create.
    let (status, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({ "title": "x".repeat(256) })),
        "10.0.12.6",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");
}

#[tokio::test]
async fn conversation_auto_titles_from_the_planet() {
    let (app, token) = setup().await;

    // Grab the first planet of the user's course.
    let (status, planets) =
        request(&app, "GET", "/api/planets", Some(&token), None, "10.0.13.1").await;
    assert_eq!(status.as_u16(), 200, "{planets}");
    let planet_id = planets[0]["id"].as_str().unwrap().to_string();
    let planet_title = planets[0]["title"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        "POST",
        "/api/conversations",
        Some(&token),
        Some(json!({ "planet_id": planet_id })),
        "10.0.13.2",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{body}");
    assert!(
        body["title"].as_str().unwrap().contains("Planet 1"),
        "{body}"
    );
    assert!(
        body["title"].as_str().unwrap().contains(&planet_title),
        "{body}"
    );
}
