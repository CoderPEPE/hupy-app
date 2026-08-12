//! Realtime tutor prompt building: the pedagogical method, the tool schemas
//! the model may call, and the per-session system instructions assembled
//! from the learner's real database state.

use crate::db::DbPool;
use crate::errors::{AppError, Result};
use crate::repositories;
use crate::services;
use serde_json::{json, Value};
use uuid::Uuid;

pub const REALTIME_MODEL: &str = "gpt-realtime-2.1";

/// Which OpenAI Realtime voice speaks each course's target language. The
/// English course keeps the original voice; Spanish/Portuguese get native-ish
/// voices so pronunciation feedback isn't anchored to English phonetics.
pub fn voice_for(language: &str) -> &'static str {
    match language {
        "es" => "coral",
        "pt" => "shimmer",
        _ => "marin",
    }
}

/// (target language name, base language name) for a course. The base is the
/// learner's own language (explanations), the target the one being taught —
/// any of the six base→target pairs.
pub fn language_names(base: &str, target: &str) -> (&'static str, &'static str) {
    let target_name = match target {
        "es" => "Spanish",
        "pt" => "Portuguese",
        _ => "English",
    };
    let base_name = match base {
        "es" => "Spanish",
        "pt" => "Portuguese",
        _ => "English",
    };
    (target_name, base_name)
}

/// The tutor's method prompt.
///
/// Three placeholders are substituted in `build_session`:
///
/// - `{{LEARNER}}` — the signed-in learner's display name (it used to be a
///   hardcoded "Sergio", which greeted every user by that name)
/// - `{{TARGET_LANG}}` — the language being taught (English/Spanish/Portuguese)
/// - `{{BASE_LANG}}` — the language used for explanations
///
/// Pronouns are deliberately they/them: the account stores an email, not a gender.
const CYCLE_PROMPT: &str = "\
You are \"Huppy\", the personal {{TARGET_LANG}} tutor of a learner who speaks {{BASE_LANG}}, named {{LEARNER}}. \
Your method is the Huppy pedagogical cycle — teach before testing, always. Stay within the CURRENT PLANET content \
below; do not introduce material from planets they haven't reached yet.\n\
\n\
For every new sentence follow this cycle:\n\
1) Present and explain: say it in {{TARGET_LANG}}, then explain its meaning briefly in {{BASE_LANG}}. When useful, name the \
subject, verb, and complement so they see how the sentence is built.\n\
2) Demonstrate pronunciation: say it clearly once, slowly, then once at natural speed.\n\
3) Ask {{LEARNER}} to repeat it at least three times, praising between attempts and correcting pronunciation, \
grammar, or word choice naturally in {{BASE_LANG}} before they try again. Only move on once they're understandable.\n\
4) Teach 1-2 related phrases that reuse the same words and structure.\n\
5) Surprise review: at unexpected moments, ask in {{BASE_LANG}} how to say something already taught (from this \
planet OR from the cumulative review list below), give a hint before revealing the answer, and test recall.\n\
6) As they improve within this planet, gradually shift from teaching in {{BASE_LANG}} to asking simple questions \
in {{TARGET_LANG}} and holding short {{TARGET_LANG}} dialogues, always within this planet's content.\n\
\n\
Correction rules: analyze pronunciation, grammar, vocabulary, and sentence structure. Explain each mistake in \
one or two short {{BASE_LANG}} sentences, then repeat the correct {{TARGET_LANG}} form slowly, breaking it into parts if \
needed, and ask {{LEARNER}} to repeat. Never humiliate; always encourage. Keep each spoken turn to 2-4 sentences. \
End most turns with one clear request or question so the conversation continues naturally.\n\
\n\
Use your tools to keep the record of their progress accurate — this is not optional bookkeeping, it's how their \
actual learning gets tracked:\n\
- Call record_correction every time you correct something they said.\n\
- Call create_flashcard when you teach an important new sentence or phrase worth reviewing later.\n\
- Call master_sentence once they can produce a CURRENT PLANET sentence correctly from memory, unaided (not just \
echoing you) — cite the sentence's id exactly as given below.\n\
- Call bump_progress with a small delta (0.03 to 0.15) to reflect your honest read of their pronunciation, \
conversation ability, listening comprehension, or review performance this turn — don't inflate it.\n\
- Call confirm_flashcard_mastery when a \"pending re-check\" flashcard below comes up naturally in conversation \
and they get it right without help.";

/// The function-calling surface the model may use mid-conversation. Each tool
/// maps to an existing REST endpoint the client executes with the real
/// conversation/planet ids — the model never sees user or resource ids.
/// Descriptions name the course's target/base languages so the model fills
/// the `en`/`pt` slots with the right texts.
pub fn tool_schemas(target: &str, base: &str) -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "name": "record_correction",
            "description": "Records a grammar, vocabulary, or pronunciation correction you just made.",
            "parameters": {
                "type": "object",
                "properties": {
                    "said": {"type": "string", "description": format!("Exactly what the learner said, in {target}")},
                    "corrected": {"type": "string", "description": format!("The corrected {target} sentence")},
                    "explanation_pt": {"type": "string", "description": format!("Short explanation in {base} of why it was wrong")},
                    "mistake_part": {"type": "string", "description": "The specific word or phrase that was wrong"},
                    "subject": {"type": "string"},
                    "verb": {"type": "string"},
                    "complement": {"type": "string"}
                },
                "required": ["said", "corrected", "explanation_pt"]
            }
        }),
        json!({
            "type": "function",
            "name": "create_flashcard",
            "description": "Creates a flashcard for an important new sentence or phrase you just taught.",
            "parameters": {
                "type": "object",
                "properties": {
                    "en": {"type": "string", "description": format!("The {target} sentence or phrase")},
                    "pt": {"type": "string", "description": format!("{base} translation")},
                    "explanation_pt": {"type": "string", "description": format!("Short explanation in {base}")},
                    "subject": {"type": "string"},
                    "verb": {"type": "string"},
                    "complement": {"type": "string"}
                },
                "required": ["en", "pt", "explanation_pt"]
            }
        }),
        json!({
            "type": "function",
            "name": "master_sentence",
            "description": "Marks a CURRENT PLANET sentence as mastered — call only once the learner produces it correctly and unaided.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sentence_id": {"type": "string", "description": "The sentence's id, exactly as listed in CURRENT PLANET content"}
                },
                "required": ["sentence_id"]
            }
        }),
        json!({
            "type": "function",
            "name": "bump_progress",
            "description": "Records your honest assessment of the learner's performance this turn on one dimension.",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": ["pronunciation", "conversation", "listening", "review"]},
                    "delta": {"type": "number", "description": "Small positive or negative amount, e.g. 0.05"}
                },
                "required": ["metric", "delta"]
            }
        }),
        json!({
            "type": "function",
            "name": "confirm_flashcard_mastery",
            "description": "Confirms a flashcard from the 'pending re-check' list was answered correctly, unaided, in conversation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "flashcard_id": {"type": "string", "description": "The flashcard's id, exactly as listed"}
                },
                "required": ["flashcard_id"]
            }
        }),
    ]
}

/// Display name for the tutor to address the learner by.
///
/// The users table stores only an email, so use its local part — the same
/// thing the app shows in its own greeting ("Hi, test"), so the spoken and
/// on-screen names always agree. Falls back to a neutral word rather than
/// inventing a person.
pub fn display_name_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("").trim();
    // Strip common separators so "ana.paula" / "ana_paula" reads naturally.
    let cleaned: String = local
        .split(['.', '_', '-', '+'])
        .find(|part| !part.is_empty())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();
    if cleaned.is_empty() {
        return "the learner".to_string();
    }
    let mut chars = cleaned.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => "the learner".to_string(),
    }
}

async fn learner_name(pool: &DbPool, user_id: Uuid) -> Result<String> {
    let user = repositories::users::find_by_id(pool, user_id).await?;
    let user = user.ok_or_else(|| AppError::not_found("resource not found"))?;
    // Prefer the learner's real name (set at registration); fall back to the
    // email local part for pre-existing accounts that never set one.
    let name = user.name.trim();
    if !name.is_empty() {
        return Ok(name.to_string());
    }
    Ok(display_name_from_email(&user.email))
}

/// Builds the tutor's system prompt from real, per-user data: the active
/// planet's sentences (so the session never drifts to content the learner
/// hasn't reached), a sample of mastered sentences from earlier planets for
/// cumulative review, and flashcards worth a surprise re-check. The method
/// prompt is parametrized with the learner's course languages.
/// Everything a Realtime session needs, assembled in one pass (the user is
/// loaded exactly once): the rendered tutor instructions, the voice (the
/// learner's choice, falling back to the course default), and the language
/// names for the tool schemas.
pub struct TutorSession {
    pub instructions: String,
    pub voice: String,
    pub target_name: &'static str,
    pub base_name: &'static str,
}

pub async fn build_session(pool: &DbPool, user_id: Uuid) -> Result<TutorSession> {
    let user = repositories::users::find_by_id(pool, user_id).await?;
    let (base_language, language) = user
        .as_ref()
        .map(|u| (u.base_language.clone(), u.language.clone()))
        .unwrap_or_else(|| ("pt".into(), "en".into()));
    let (target_name, base_name) = language_names(&base_language, &language);
    let instructions =
        build_instructions_for(pool, user_id, &base_language, &language).await?;
    // A voice stored before the catalog shrank (e.g. "onyx") would 400 the
    // whole session, so anything not in the catalog falls back to the course
    // default.
    let stored = user.map(|u| u.voice).unwrap_or_default();
    let voice = if !stored.is_empty() && repositories::voices::exists(pool, &stored).await? {
        stored
    } else {
        voice_for(&language).to_string()
    };
    Ok(TutorSession {
        instructions,
        voice,
        target_name,
        base_name,
    })
}

async fn build_instructions_for(
    pool: &DbPool,
    user_id: Uuid,
    base_language: &str,
    language: &str,
) -> Result<String> {
    let (target_name, base_name) = language_names(base_language, language);

    let planet = services::planets::active_planet_for(pool, user_id).await?;
    // The active planet's course decides which columns hold the target text;
    // it always matches the user's chosen pair, but is authoritative.
    let sentences = repositories::planets::tutor_sentences(
        pool,
        user_id,
        planet.id,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    let cumulative = repositories::planets::cumulative_review_sample(
        pool,
        user_id,
        planet.number,
        8,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    let review_cards = repositories::flashcards::review_targets(pool, user_id, 5).await?;

    let mut out = String::new();
    out.push_str(&format!(
        "CURRENT PLANET: {} (Planet {})\n",
        planet.title, planet.number
    ));
    out.push_str(&format!(
        "Sentences for this planet (id — {target_name} — {base_name} — subject/verb/complement — status):\n"
    ));
    for s in &sentences {
        out.push_str(&format!(
            "- [{}] {} — {} — ({}/{}/{}) — {}\n",
            s.id,
            s.en,
            s.pt,
            s.subject,
            s.verb,
            s.complement,
            if s.mastered {
                "mastered, review only"
            } else {
                "not yet taught"
            }
        ));
    }

    if !cumulative.is_empty() {
        out.push_str("\nCUMULATIVE REVIEW — occasionally weave these earlier-planet sentences in unexpectedly:\n");
        for (en, pt) in &cumulative {
            out.push_str(&format!("- {en} — {pt}\n"));
        }
    }

    if !review_cards.is_empty() {
        out.push_str(
            "\nFLASHCARDS PENDING RE-CHECK — surprise-quiz these if a natural moment comes up:\n",
        );
        for (id, en, pt) in &review_cards {
            out.push_str(&format!("- [{id}] {en} — {pt}\n"));
        }
    }

    out.push('\n');
    let name = learner_name(pool, user_id).await?;
    out.push_str(
        &CYCLE_PROMPT
            .replace("{{LEARNER}}", &name)
            .replace("{{TARGET_LANG}}", target_name)
            .replace("{{BASE_LANG}}", base_name),
    );
    Ok(out)
}

#[cfg(test)]
mod learner_name_tests {
    use super::display_name_from_email;

    #[test]
    fn uses_the_email_local_part_capitalized() {
        assert_eq!(display_name_from_email("ana@example.com"), "Ana");
        assert_eq!(display_name_from_email("test@gmail.com"), "Test");
    }

    #[test]
    fn takes_the_first_segment_of_a_separated_local_part() {
        assert_eq!(display_name_from_email("ana.paula@example.com"), "Ana");
        assert_eq!(display_name_from_email("joao_silva@example.com"), "Joao");
        assert_eq!(display_name_from_email("maria-luz@example.com"), "Maria");
        assert_eq!(display_name_from_email("bruno+tag@example.com"), "Bruno");
    }

    #[test]
    fn falls_back_instead_of_inventing_a_name() {
        assert_eq!(display_name_from_email(""), "the learner");
        assert_eq!(display_name_from_email("@example.com"), "the learner");
        assert_eq!(display_name_from_email("..@example.com"), "the learner");
    }

    #[test]
    fn the_prompt_has_no_leftover_placeholder_or_hardcoded_person() {
        let rendered = super::CYCLE_PROMPT
            .replace("{{LEARNER}}", "Ana")
            .replace("{{TARGET_LANG}}", "Portuguese")
            .replace("{{BASE_LANG}}", "English");
        assert!(!rendered.contains("{{LEARNER}}"));
        assert!(!rendered.contains("{{TARGET_LANG}}"));
        assert!(!rendered.contains("{{BASE_LANG}}"));
        assert!(!rendered.contains("Sergio"));
        assert!(rendered.contains("Ana"));
        // The base-speaker phrasing must stay grammatical for every course:
        // "a learner who speaks English" — never "a English-speaking".
        assert!(!rendered.contains("a English"));
        assert!(!rendered.contains("English-speaking"));
    }

    #[test]
    fn language_names_cover_all_course_pairs() {
        assert_eq!(super::language_names("pt", "en"), ("English", "Portuguese"));
        assert_eq!(super::language_names("pt", "es"), ("Spanish", "Portuguese"));
        assert_eq!(super::language_names("en", "pt"), ("Portuguese", "English"));
        assert_eq!(super::language_names("es", "en"), ("English", "Spanish"));
        assert_eq!(super::language_names("en", "es"), ("Spanish", "English"));
        assert_eq!(super::language_names("es", "pt"), ("Portuguese", "Spanish"));
    }

    #[test]
    fn voices_are_assigned_per_language() {
        assert_eq!(super::voice_for("en"), "marin");
        assert_eq!(super::voice_for("es"), "coral");
        assert_eq!(super::voice_for("pt"), "shimmer");
        assert_eq!(super::voice_for("unknown"), "marin");
    }

    /// Every default (and so every fallback build_session can pick) must be
    /// in the seeded catalog — those are the voices gpt-realtime accepts, and
    /// anything else 400s the session on creation.
    #[test]
    fn language_defaults_are_seeded_voices() {
        let seed = include_str!("../../migrations/2026-08-11-000009_tutor_voices/up.sql");
        for lang in ["en", "es", "pt", "unknown"] {
            let voice = super::voice_for(lang);
            assert!(
                seed.contains(&format!("('{voice}',")),
                "default voice for {lang} is not in the tutor_voices catalog"
            );
        }
    }
}
