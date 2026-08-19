//! The learning cycle, end to end: conversation → module flashcards → next
//! module. The gate is the product's core rule, so it is tested through HTTP
//! rather than only at the service layer.

mod common;

use common::{app, pool, register, request, unique_email};
use hupy_backend::repositories;
use serde_json::json;

/// Gives a module an authored chunk list (what the `seed_curriculum` binary
/// writes in production) so the record_production flow has structures to
/// count. The plain seed only creates empty `structures` arrays.
async fn author_structures(lesson_id: &str) {
    repositories::modules::set_curriculum(
        pool(),
        lesson_id.parse().unwrap(),
        "Module 1",
        "Build sentences.",
        "focus:greetings",
        json!([
            {"target": "Good morning.", "base": "Bom dia."},
            {"target": "I am fine.", "base": "Estou bem."},
        ]),
    )
    .await
    .expect("seed module structures");
}

/// Drives the tutor's `record_production` loop for one target: `times`
/// correct productions, returning the last response body.
async fn produce(
    app: &common::Router,
    token: &str,
    lesson_id: &str,
    target: &str,
    times: usize,
    ip: &str,
) -> serde_json::Value {
    let mut body = serde_json::Value::Null;
    for _ in 0..times {
        let (status, b) = request(
            app,
            "POST",
            &format!("/api/modules/{lesson_id}/production"),
            Some(token),
            Some(json!({ "target": target })),
            ip,
        )
        .await;
        assert_eq!(status.as_u16(), 200, "production {target}: {b}");
        body = b;
    }
    body
}

/// The planet's modules, with each one's state.
async fn modules(
    app: &common::Router,
    token: &str,
    planet_id: &str,
    ip: &str,
) -> Vec<serde_json::Value> {
    let (_, detail) = request(
        app,
        "GET",
        &format!("/api/planets/{planet_id}"),
        Some(token),
        None,
        ip,
    )
    .await;
    detail["lessons"].as_array().cloned().unwrap_or_default()
}

#[tokio::test]
async fn a_fresh_planet_opens_only_its_first_module() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-open")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.60.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();

    let list = modules(&app, &token, &p1, "10.0.60.2").await;
    assert_eq!(list.len(), 10, "the ten-module path");
    assert_eq!(list[0]["state"], "current");
    assert!(
        list[1..].iter().all(|m| m["state"] == "locked"),
        "everything after the first module stays shut"
    );
}

/// The rule the whole spec turns on: finishing the conversation is not
/// finishing the module — its flashcards have to be cleared too.
#[tokio::test]
async fn the_next_module_waits_for_the_flashcards() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-gate")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.61.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.61.2").await;
    let m1 = list[0]["id"].as_str().unwrap().to_string();

    // The tutor mints a card during the conversation, as it is told to.
    let (status, card) = request(
        &app,
        "POST",
        "/api/flashcards",
        Some(&token),
        Some(json!({
            "en": "I have a car", "pt": "Eu tenho um carro",
            "planet_id": p1, "lesson_id": m1, "source": "tutor"
        })),
        "10.0.61.3",
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{card}");
    let card_id = card["id"].as_str().unwrap().to_string();
    assert_eq!(card["lesson_id"], m1.as_str());

    // …then closes the conversation.
    let (status, closed) = request(
        &app,
        "POST",
        &format!("/api/modules/{m1}/complete-conversation"),
        Some(&token),
        Some(json!({ "weak_structures": ["She has a car"] })),
        "10.0.61.4",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{closed}");
    assert_eq!(closed["conversation_done"], true);
    assert_eq!(closed["flashcards_done"], false, "one card is unreviewed");
    assert!(closed["next_lesson_id"].is_null(), "nothing opens yet");

    let list = modules(&app, &token, &p1, "10.0.61.5").await;
    assert_eq!(list[0]["state"], "flashcards_pending");
    assert_eq!(list[1]["state"], "locked", "module 2 is still shut");
    assert_eq!(list[0]["flashcards_total"], 1);
    assert_eq!(list[0]["flashcards_reviewed"], 0);

    // Reviewing the module's card closes the other half of the gate.
    let (status, reviewed) = request(
        &app,
        "POST",
        &format!("/api/flashcards/{card_id}/review"),
        Some(&token),
        Some(json!({ "rating": "medium" })),
        "10.0.61.6",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{reviewed}");

    let list = modules(&app, &token, &p1, "10.0.61.7").await;
    assert_eq!(list[0]["state"], "completed");
    assert_eq!(list[1]["state"], "current", "module 2 is now open");
    assert_eq!(list[2]["state"], "locked");
}

/// The deterministic core of the fix: productions are counted per structure,
/// the count persists (the checkpoint), and the module's conversation closes
/// automatically the moment the last structure reaches its third correct
/// production — no reliance on the model remembering to call complete_module.
#[tokio::test]
async fn three_productions_finish_each_structure_and_close_the_module() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-prod")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.65.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.65.2").await;
    let m1_id = list[0]["id"].as_str().unwrap().to_string();
    author_structures(&m1_id).await;

    // First production of the first structure: count 1, module still open.
    let body = produce(&app, &token, &m1_id, "Good morning.", 1, "10.0.65.3").await;
    assert_eq!(body["productions"], 1);
    assert_eq!(body["done_count"], 0);
    assert_eq!(body["all_structures_done"], false);
    assert_eq!(body["conversation_done"], false);

    // Two more productions on the same structure finish it…
    let body = produce(&app, &token, &m1_id, "Good morning.", 2, "10.0.65.4").await;
    assert_eq!(body["productions"], 3, "capped at the requirement");
    assert_eq!(body["done_count"], 1);
    assert_eq!(
        body["conversation_done"], false,
        "one of two structures is not enough"
    );

    // …and a re-call on a finished structure must not farm an endless count.
    let body = produce(&app, &token, &m1_id, "Good morning.", 1, "10.0.65.5").await;
    assert_eq!(body["productions"], 3, "stays capped at 3");
    assert_eq!(body["done_count"], 1);

    // The planet detail exposes the checkpoint to the app's progress bar.
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.65.6",
    )
    .await;
    let s0 = &detail["lessons"][0]["structures"][0];
    assert_eq!(s0["target"], "Good morning.");
    assert_eq!(s0["productions"], 3);
    assert_eq!(s0["done"], true);

    // Drilling the second structure 3 times closes the conversation.
    let body = produce(&app, &token, &m1_id, "I am fine.", 3, "10.0.65.7").await;
    assert_eq!(body["all_structures_done"], true);
    assert_eq!(
        body["conversation_done"], true,
        "module closes automatically"
    );
    assert_eq!(
        body["flashcards_done"], true,
        "no cards minted, nothing to review"
    );

    let list = modules(&app, &token, &p1, "10.0.65.8").await;
    assert_eq!(list[0]["state"], "completed");
    assert_eq!(list[1]["state"], "current", "module 2 opens");
}

/// The checkpoint really is the resume point: a fresh conversation reads the
/// same persisted counts, so a learner who closes the app mid-module does not
/// start over from the first sentence.
#[tokio::test]
async fn productions_survive_a_restart_and_resume_at_the_checkpoint() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-resume")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.66.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.66.2").await;
    let m1_id = list[0]["id"].as_str().unwrap().to_string();
    author_structures(&m1_id).await;

    produce(&app, &token, &m1_id, "Good morning.", 2, "10.0.66.3").await;

    // "Closing the app": a brand-new request path (fresh detail fetch) sees
    // 2/3 on the first structure and zero on the second.
    let (_, detail) = request(
        &app,
        "GET",
        &format!("/api/planets/{p1}"),
        Some(&token),
        None,
        "10.0.66.4",
    )
    .await;
    let structures = detail["lessons"][0]["structures"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(structures[0]["productions"], 2);
    assert_eq!(structures[0]["done"], false);
    assert_eq!(structures[1]["productions"], 0);
    assert_eq!(structures[1]["done"], false);

    // One more production resumes exactly where they left off.
    let body = produce(&app, &token, &m1_id, "Good morning.", 1, "10.0.66.5").await;
    assert_eq!(body["productions"], 3);
    assert_eq!(body["done_count"], 1);
}

/// The tutor may only log productions for the module it is actually teaching;
/// a structure that is not in the module (or a locked module) is rejected.
#[tokio::test]
async fn productions_are_scoped_to_the_current_modules_own_structures() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-scope")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.67.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.67.2").await;
    let m1_id = list[0]["id"].as_str().unwrap().to_string();
    author_structures(&m1_id).await;

    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/modules/{m1_id}/production"),
        Some(&token),
        Some(json!({ "target": "I can fly." })),
        "10.0.67.3",
    )
    .await;
    assert_eq!(status.as_u16(), 400, "{body}");

    // A locked module (module 2) refuses productions entirely.
    let m5_id = list[4]["id"].as_str().unwrap().to_string();
    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/modules/{m5_id}/production"),
        Some(&token),
        Some(json!({ "target": "Good morning." })),
        "10.0.67.4",
    )
    .await;
    assert_eq!(status.as_u16(), 409, "{body}");
}

/// A module with no cards has nothing to review — it must not strand the
/// learner behind an empty deck.
#[tokio::test]
async fn a_module_without_cards_completes_on_the_conversation_alone() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-empty")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.62.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.62.2").await;
    let m1 = list[0]["id"].as_str().unwrap().to_string();

    let (status, closed) = request(
        &app,
        "POST",
        &format!("/api/modules/{m1}/complete-conversation"),
        Some(&token),
        None,
        "10.0.62.3",
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{closed}");
    assert_eq!(closed["flashcards_done"], true);
    assert_eq!(closed["next_lesson_id"], list[1]["id"]);
}

/// The tutor is told which module it is teaching; a call naming any other one
/// would let a session skip the curriculum.
#[tokio::test]
async fn a_module_out_of_turn_cannot_be_completed() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-skip")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.63.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.63.2").await;
    let m5 = list[4]["id"].as_str().unwrap().to_string();

    let (status, body) = request(
        &app,
        "POST",
        &format!("/api/modules/{m5}/complete-conversation"),
        Some(&token),
        None,
        "10.0.63.3",
    )
    .await;
    assert_eq!(status.as_u16(), 409, "{body}");

    let list = modules(&app, &token, &p1, "10.0.63.4").await;
    assert_eq!(list[0]["state"], "current", "still on module 1");
    assert_eq!(list[4]["state"], "locked");
}

/// The audio story is the planet's reward: it opens on the tenth module, not
/// on a mastery average.
#[tokio::test]
async fn the_audio_story_unlocks_when_every_module_is_done() {
    let app = app(30, 120);
    let token = register(&app, &unique_email("mod-audio")).await;
    let (_, planets) = request(&app, "GET", "/api/planets", Some(&token), None, "10.0.64.1").await;
    let p1 = planets[0]["id"].as_str().unwrap().to_string();
    let list = modules(&app, &token, &p1, "10.0.64.2").await;

    for (i, module) in list.iter().enumerate() {
        let id = module["id"].as_str().unwrap();
        let (status, body) = request(
            &app,
            "POST",
            &format!("/api/modules/{id}/complete-conversation"),
            Some(&token),
            None,
            "10.0.64.3",
        )
        .await;
        assert_eq!(status.as_u16(), 200, "module {}: {body}", i + 1);

        // The story stays shut until the very last module is behind them.
        if i < list.len() - 1 {
            let (_, stories) =
                request(&app, "GET", "/api/stories", Some(&token), None, "10.0.64.4").await;
            let entry = stories
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["planet"]["id"] == p1.as_str())
                .unwrap()
                .clone();
            assert_eq!(
                entry["unlocked"],
                false,
                "story leaked after module {}",
                i + 1
            );
        }
    }

    let (_, stories) = request(&app, "GET", "/api/stories", Some(&token), None, "10.0.64.5").await;
    let entry = stories
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["planet"]["id"] == p1.as_str())
        .unwrap()
        .clone();
    assert_eq!(entry["unlocked"], true, "ten modules done: {entry}");
}
