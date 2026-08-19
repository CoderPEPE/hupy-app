//! Realtime tutor prompt building: the pedagogical method, the tool schemas
//! the model may call, and the per-session system instructions assembled
//! from the learner's real database state.

use crate::db::DbPool;
use crate::errors::{AppError, Result};
use crate::models::{ActivePlanet, PlanetLesson};
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
You are \"hupy\", the personal {{TARGET_LANG}} tutor of a learner who speaks {{BASE_LANG}}, named {{LEARNER}}. \
Your method is the hupy pedagogical cycle — teach before testing, always.\n\
\n\
You do NOT choose the curriculum. The system decides WHAT is taught; you decide HOW to teach it to this \
learner. Everything you teach this session comes from THIS MODULE below — not the rest of the planet, not \
later modules, not later planets. Teaching ahead is the one thing you must never do.\n\
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
6) Vary the subject once the structure is solid (I -> he/she/we/they), explaining the change in one short \
sentence, then have them say it.\n\
7) As they improve, shift from explaining in {{BASE_LANG}} to asking simple questions in {{TARGET_LANG}} and \
holding short {{TARGET_LANG}} dialogues — always built from THIS MODULE's structures.\n\
\n\
If they stall or go quiet, never leave them stuck: say the sentence for them, break it into two or three \
pieces, and ask them to repeat it piece by piece before putting it back together.\n\
\n\
Correction rules: analyze pronunciation, grammar, vocabulary, and sentence structure. Explain each mistake in \
one or two short {{BASE_LANG}} sentences, then repeat the correct {{TARGET_LANG}} form slowly, breaking it into parts if \
needed, and ask {{LEARNER}} to repeat. Never humiliate; always encourage. Keep each spoken turn to 2-4 sentences. \
End most turns with one clear request or question so the conversation continues naturally.\n\
\n\
Use your tools to keep the record of their progress accurate — this is not optional bookkeeping, it's how their \
actual learning gets tracked:\n\
- Call record_correction every time you correct something they said.\n\
- Call create_flashcard for the structures this module drills — one per structure you work on — and also for \
anything they got wrong repeatedly or struggled to pronounce. Their deck should be a record of this \
conversation, not a generic word list; it is what they review to open the next module.\n\
- Call master_sentence once they can produce a CURRENT PLANET sentence correctly from memory, unaided (not just \
echoing you) — cite the sentence's id exactly as given below.\n\
- Call bump_progress with a small delta (0.03 to 0.15) to reflect your honest read of their pronunciation, \
conversation ability, listening comprehension, or review performance this turn — don't inflate it.\n\
- Call confirm_flashcard_mastery when a \"pending re-check\" flashcard below comes up naturally in conversation \
and they get it right without help.\n\
- Call record_production with the exact target sentence of the CURRENT structure every time they produce \
it correctly. The system keeps these counts as the module's checkpoint: three correct productions finish a \
structure, and once every structure of THIS MODULE has its three, the module's conversation closes \
automatically — you do not need to call complete_module, and doing so after the close is an error. A \
structure that has reached its count is DONE: never drill it again in full, at most one quick recall check.\n\
\n\
Staying on the module:\n\
- If they ask a question about the language, answer it briefly, then return to the practice in the same turn \
(\"... Now, back to our module — how do you say ...?\").\n\
- If they change the subject entirely, acknowledge it in a sentence, then bring them back to the module.\n\
- Never start teaching a structure that is not listed under THIS MODULE. If they ask for one, tell them it is \
coming in a later module and return to the current practice.\n\
- Work through THIS MODULE's structures strictly in the order they are listed, and move on the moment the \
current one reaches its required productions. Never go back to re-drill a finished structure from scratch \
and never restart the module once it is closed — that is the loop the checkpoint exists to prevent.";

/// The tutor's method prompt for the FREE conversation session (the Chat tab
/// with no lesson/planet context). Same voice and personality, same
/// correction/flashcard habits — but no fixed curriculum: the learner talks
/// about whatever they want, and the tutor teaches from the conversation.
/// Placeholders are identical to [`CYCLE_PROMPT`]'s.
const GENERIC_PROMPT: &str = "\
You are \"hupy\", the personal {{TARGET_LANG}} tutor of a learner who speaks {{BASE_LANG}}, named {{LEARNER}}. \
This is a free conversation — there is no fixed lesson or planet. Let the learner talk about whatever \
interests them, and teach naturally from the conversation.\n\
\n\
Conversation rules:\n\
- Speak {{TARGET_LANG}} first, always; use {{BASE_LANG}} briefly to explain or support when the learner needs it.\n\
- Follow the learner's lead: chat about their day, plans, opinions, stories, or questions. Turn their \
attempts into natural {{TARGET_LANG}} dialogue.\n\
- Correct gently: pronunciation, grammar, vocabulary, and word choice. Explain each mistake in one or two \
short {{BASE_LANG}} sentences, give the correct {{TARGET_LANG}} form, and ask them to repeat it once.\n\
- When they use or need an important new word or phrase, teach it with 1-2 related phrases that reuse the \
same structure.\n\
- If they struggle to say something, offer the right sentence and ask them to repeat it — never let them \
get stuck.\n\
- Keep each spoken turn to 2-4 sentences and end with one clear question or prompt so the conversation \
keeps flowing.\n\
- Never humiliate; always encourage.\n\
\n\
Use your tools to keep the record of their progress accurate — this is not optional bookkeeping, it's how \
their actual learning gets tracked:\n\
- Call record_correction every time you correct something they said.\n\
- Call create_flashcard when you teach an important new sentence or phrase worth reviewing later.\n\
- Call confirm_flashcard_mastery when a \"pending re-check\" flashcard comes up naturally in conversation \
and they get it right without help.";

/// The function-calling surface the model may use mid-conversation. Each tool
/// maps to an existing REST endpoint the client executes with the real
/// conversation/planet ids — the model never sees user or resource ids.
/// Descriptions name the course's target/base languages so the model fills
/// the `en`/`pt` slots with the right texts.
///
/// `include_progress` is false for the free (generic) conversation, where
/// there is no planet to record progress against: `master_sentence` and
/// `bump_progress` are omitted so the model never tries to call them.
pub fn tool_schemas(target: &str, base: &str, include_progress: bool) -> Vec<Value> {
    let mut tools = vec![
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
    ];
    if include_progress {
        tools.push(
            json!({
                "type": "function",
                "name": "record_production",
                "description": format!("Records that the learner just produced the current structure correctly. Call it once per correct production, citing the exact {target} sentence as listed under THIS MODULE. The system counts these and closes the module automatically once every structure reaches its required count (3) — this count is the module's checkpoint, so it also survives app restarts."),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target": {"type": "string", "description": format!("The exact {target} sentence from THIS MODULE's list that the learner just produced")}
                    },
                    "required": ["target"]
                }
            }),
        );
        tools.push(
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
        );
        tools.push(
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
        );
        tools.push(json!({
            "type": "function",
            "name": "complete_module",
            "description": "Closes the current module. Call this ONLY once the learner has produced every structure of THIS MODULE correctly at least three times, with variation. It unlocks the module's flashcards; the next module opens after those are reviewed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "weak_structures": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": format!("The {target} structures they kept getting wrong, so later modules bring them back")
                    }
                },
                "required": []
            }
        }));
    }
    tools
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
    /// True for the free-conversation session (the generic Chat tab) — no
    /// planet scope, and the endpoint attaches the reduced tool set without
    /// the planet-dependent progress tools.
    pub generic: bool,
}

/// Builds the session the Realtime client connects to.
///
/// `generic` = the free-conversation tutor (no planet content). Otherwise
/// the session is scoped to `planet_id` when given, or to the learner's
/// active planet when not.
pub async fn build_session(
    pool: &DbPool,
    user_id: Uuid,
    planet_id: Option<Uuid>,
    generic: bool,
) -> Result<TutorSession> {
    let user = repositories::users::find_by_id(pool, user_id).await?;
    let (base_language, language) = user
        .as_ref()
        .map(|u| (u.base_language.clone(), u.language.clone()))
        .unwrap_or_else(|| ("pt".into(), "en".into()));
    let (target_name, base_name) = language_names(&base_language, &language);
    let instructions = if generic {
        build_generic_instructions(pool, user_id, &base_language, &language).await?
    } else {
        // The lesson's planet decides which course columns hold the target
        // text; when no planet is named, the learner's active planet does.
        let planet = match planet_id {
            Some(pid) => {
                let p = repositories::planets::find(pool, pid)
                    .await?
                    .ok_or_else(|| AppError::not_found("planet not found"))?;
                ActivePlanet {
                    id: p.id,
                    number: p.number,
                    title: p.title,
                    base_language: p.base_language,
                    language: p.language,
                }
            }
            None => services::planets::active_planet_for(pool, user_id).await?,
        };
        build_instructions_for(pool, user_id, &planet, &base_language, &language).await?
    };
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
        generic,
    })
}

/// The free-conversation instructions: the generic tutor prompt with the
/// learner's name and course languages, and no curriculum context at all.
async fn build_generic_instructions(
    pool: &DbPool,
    user_id: Uuid,
    base_language: &str,
    language: &str,
) -> Result<String> {
    let (target_name, base_name) = language_names(base_language, language);
    let name = learner_name(pool, user_id).await?;
    Ok(GENERIC_PROMPT
        .replace("{{LEARNER}}", &name)
        .replace("{{TARGET_LANG}}", target_name)
        .replace("{{BASE_LANG}}", base_name))
}

async fn build_instructions_for(
    pool: &DbPool,
    user_id: Uuid,
    planet: &ActivePlanet,
    base_language: &str,
    language: &str,
) -> Result<String> {
    let (target_name, base_name) = language_names(base_language, language);

    // The three prompt layers the spec calls for: the planet's goal, the one
    // module the learner is on, and (in CYCLE_PROMPT) the global method. The
    // module layer is the tight one — it is the only content the tutor may
    // teach this session.
    let modules = repositories::modules::lessons_for(pool, planet.id).await?;
    let module_progress =
        repositories::modules::progress_for_planet(pool, user_id, planet.id).await?;
    let current = services::curriculum::current_module(&modules, &module_progress);
    let full_planet = repositories::planets::find(pool, planet.id).await?;

    let mut out = String::new();
    out.push_str(&format!(
        "CURRENT PLANET: {} (Planet {})\n",
        planet.title, planet.number
    ));
    if let Some(p) = &full_planet {
        if !p.goal.is_empty() {
            out.push_str(&format!("Planet goal: {}\n", p.goal));
        }
        let verbs = services::curriculum::focus_verbs(&p.focus_verbs);
        if !verbs.is_empty() {
            out.push_str(&format!("Verbs this planet drills: {}\n", verbs.join(", ")));
        }
    }

    // The spec's "a IA precisa conhecer o progresso do aluno": not a count,
    // but which modules are behind them and what they can already say.
    let states = services::curriculum::module_states(&modules, &module_progress);
    let finished: Vec<&PlanetLesson> = modules
        .iter()
        .zip(&states)
        .filter(|(_, s)| s.is_completed())
        .map(|(m, _)| m)
        .collect();
    out.push_str(&format!(
        "Modules finished: {} of {}{}\n",
        finished.len(),
        modules.len(),
        if finished.is_empty() {
            String::new()
        } else {
            format!(
                " — {}",
                finished
                    .iter()
                    .map(|m| format!("{} ({})", m.position, m.title))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        }
    ));
    if !finished.is_empty() {
        out.push_str(
            "Their flashcards are done too — that is what opened the current module.\n\
             OPEN THE SESSION with a short warm-up: one or two recall questions from those \
             finished modules, then move into the current one. Do not re-teach them.\n",
        );
    }
    out.push('\n');

    match current {
        Some(module) => {
            out.push_str(&format!(
                "THIS MODULE — module {} of {}: {} (focus: {})\n",
                module.position,
                modules.len(),
                module.title,
                if module.focus.is_empty() {
                    module.kind.as_str()
                } else {
                    // Stored as "focus:greetings" / "past"; the prefix is a
                    // storage detail, not something to read out at the tutor.
                    module.focus.strip_prefix("focus:").unwrap_or(&module.focus)
                },
            ));
            if !module.description.is_empty() {
                out.push_str(&format!("{}\n", module.description));
            }
            let structures = services::curriculum::structures(&module.structures);
            if structures.is_empty() {
                // No chunk list authored yet — fall back to the planet's
                // sentences so the session still has something concrete,
                // rather than leaving the tutor to invent a syllabus.
                let sentences = repositories::planets::tutor_sentences(
                    pool,
                    user_id,
                    planet.id,
                    &planet.base_language,
                    &planet.language,
                )
                .await?;
                out.push_str(&format!(
                    "Structures to teach ({target_name} — {base_name} — id):\n"
                ));
                for s in &sentences {
                    out.push_str(&format!("- {} — {} — [{}]\n", s.en, s.pt, s.id));
                }
                out.push_str(
                    "This module has no authored chunk list, so teach from the planet's sentences \
                     above. Call master_sentence (citing the id) once they produce a sentence \
                     unaided; when every sentence above is mastered, the module's conversation \
                     closes automatically.\n",
                );
            } else {
                let counts =
                    repositories::modules::structure_progress(pool, user_id, module.id).await?;
                let required = services::curriculum::REQUIRED_PRODUCTIONS;
                out.push_str(&format!(
                    "Structures to teach — every one of these, and nothing beyond them \
                     ({target_name} — {base_name} — productions):\n"
                ));
                for (i, s) in structures.iter().enumerate() {
                    let p = counts.get(&s.target).copied().unwrap_or(0);
                    let done = p >= required as i32;
                    out.push_str(&format!(
                        "- {}. {} — {} — {}/{} {}\n",
                        i + 1,
                        s.target,
                        s.base,
                        p.min(required as i32),
                        required,
                        if done { "DONE" } else { "to go" },
                    ));
                }
                out.push_str(
                    "\nCHECKPOINT — these counts are the learner's real, saved progress (they \
                     survive app restarts). Resume from the first structure below 3/3 and work \
                     strictly in order. Structures marked DONE are finished: never restart their \
                     drill, at most one quick recall check. When the last structure reaches 3/3 \
                     the module's conversation closes automatically.\n",
                );
            }

            // The other half of the gate, in the tutor's own briefing: what
            // this module's deck looks like and what it is holding shut.
            let (cards_total, cards_reviewed) =
                repositories::modules::flashcard_counts(pool, user_id, module.id).await?;
            let conversation_done = module_progress
                .get(&module.id)
                .is_some_and(|p| p.conversation_done);
            if conversation_done {
                out.push_str(&format!(
                    "\nSTATUS: this module's conversation is already DONE. {cards_reviewed} of \
                     {cards_total} of its flashcards are reviewed, and module {} stays LOCKED \
                     until they all are. Do not teach this module again from scratch and do not \
                     call complete_module: hold a short review of the structures above, then tell \
                     them their flashcards are what opens the next module.\n",
                    module.position + 1,
                ));
            } else {
                out.push_str(&format!(
                    "\nSTATUS: conversation in progress. Flashcards for this module: {cards_total} \
                     so far ({cards_reviewed} reviewed) — they are created by your create_flashcard \
                     calls, and the learner must review them before module {} opens. Make one for \
                     each structure you drill here.\n",
                    module.position + 1,
                ));
            }

            // Earlier modules of this planet are fair game as review — the
            // spec's active recall — but only as recall, never as new
            // teaching.
            let earlier: Vec<_> = modules
                .iter()
                .filter(|m| m.position < module.position)
                .flat_map(|m| services::curriculum::structures(&m.structures))
                .collect();
            if !earlier.is_empty() {
                // The review module is the planet's final challenge — the spec
                // wants it drawing on everything taught here, so it gets the
                // whole list rather than the usual window.
                let cap = if module.focus == "review" {
                    earlier.len()
                } else {
                    20
                };
                out.push_str(if module.focus == "review" {
                    "\nEVERYTHING THIS PLANET TAUGHT — this is the review module: build the \
                     conversation out of these, mixing them freely, and close the planet with them:\n"
                } else {
                    "\nEARLIER MODULES OF THIS PLANET — bring these back unannounced as recall \
                     checks (\"how do you say ...?\"), never as new teaching:\n"
                });
                for s in earlier.iter().take(cap) {
                    out.push_str(&format!("- {} — {}\n", s.target, s.base));
                }
            }

            // What they have been getting wrong, from the modules already
            // behind them: the tutor should keep meeting these again.
            let weak: Vec<String> = module_progress
                .values()
                .flat_map(|p| {
                    p.weak_structures
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default()
                })
                .collect();
            if !weak.is_empty() {
                out.push_str(
                    "\nSTILL SHAKY — they have got these wrong before; work them back in and check \
                     they have stuck:\n",
                );
                for w in weak.iter().take(12) {
                    out.push_str(&format!("- {w}\n"));
                }
            }
        }
        None => {
            // Every module is done: this is a free review of the whole planet
            // while the learner waits for the next one.
            out.push_str(
                "THIS PLANET IS FINISHED — every module is complete. Hold a free review \
                 conversation using only what this planet taught; do not open new material.\n",
            );
        }
    }

    let cumulative = repositories::planets::cumulative_review_sample(
        pool,
        user_id,
        planet.number,
        8,
        &planet.base_language,
        &planet.language,
    )
    .await?;
    if !cumulative.is_empty() {
        out.push_str(
            "\nCUMULATIVE REVIEW — occasionally weave these earlier-planet sentences in unexpectedly:\n",
        );
        for (en, pt) in &cumulative {
            out.push_str(&format!("- {en} — {pt}\n"));
        }
    }

    let review_cards = repositories::flashcards::review_targets(pool, user_id, 5).await?;
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

    /// The free (generic) conversation has no planet to record progress
    /// against, so the model must never be offered the planet tools.
    #[test]
    fn generic_sessions_omit_the_planet_progress_tools() {
        let generic = super::tool_schemas("English", "Portuguese", false);
        let names: Vec<&str> = generic.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"record_correction"));
        assert!(names.contains(&"create_flashcard"));
        assert!(names.contains(&"confirm_flashcard_mastery"));
        assert!(!names.contains(&"master_sentence"));
        assert!(!names.contains(&"bump_progress"));
        assert!(!names.contains(&"record_production"));

        let lesson = super::tool_schemas("English", "Portuguese", true);
        let names: Vec<&str> = lesson.iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"record_production"));
        assert!(names.contains(&"master_sentence"));
        assert!(names.contains(&"bump_progress"));
    }

    /// The lesson prompt must never tell the tutor to close the module by
    /// hand — completion is deterministic, driven by record_production, so
    /// the old self-assessed complete_module instruction must not survive.
    #[test]
    fn the_prompt_closes_modules_deterministically_via_production_counts() {
        let rendered = super::CYCLE_PROMPT
            .replace("{{LEARNER}}", "Ana")
            .replace("{{TARGET_LANG}}", "English")
            .replace("{{BASE_LANG}}", "Portuguese");
        assert!(
            rendered.contains("record_production"),
            "the tutor logs productions"
        );
        assert!(
            rendered.contains("closes automatically"),
            "completion is the system's job, not the model's"
        );
        assert!(
            !rendered.contains("Call complete_module ONLY"),
            "no more self-assessed completion gate"
        );
        assert!(
            rendered.contains("Never go back to re-drill a finished structure"),
            "the anti-loop rule is explicit"
        );
    }

    /// The free-conversation prompt must not promise a curriculum it cannot
    /// keep (no CURRENT PLANET section, no progress tools to back it up).
    #[test]
    fn generic_prompt_is_free_form_without_planet_content() {
        let rendered = super::GENERIC_PROMPT
            .replace("{{LEARNER}}", "Ana")
            .replace("{{TARGET_LANG}}", "English")
            .replace("{{BASE_LANG}}", "Portuguese");
        assert!(!rendered.contains("{{LEARNER}}"));
        assert!(!rendered.contains("CURRENT PLANET"));
        assert!(!rendered.contains("master_sentence"));
        assert!(!rendered.contains("bump_progress"));
        assert!(rendered.contains("free conversation"));
        assert!(rendered.contains("record_correction"));
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
