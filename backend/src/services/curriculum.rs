//! The module state machine — the spec's learning cycle, in one place.
//!
//! ```text
//! conversation -> module flashcards -> next module unlocks
//! ten modules   -> planet complete   -> audio story unlocks
//! ```
//!
//! A module is finished only when the learner has both held its conversation
//! (the tutor calls `complete_module` once they have produced every target
//! structure correctly) and cleared the flashcards that conversation minted.
//! Nothing here reads the planet's mastery average: progression is the gate,
//! mastery is only a display number.

use crate::models::{ModuleProgress, PlanetLesson};
use serde_json::Value;
use std::collections::HashMap;
use uuid::Uuid;

/// Modules per planet. The curriculum is fixed at ten (verb 1, verb 2,
/// verb 3, mix, past, future, questions, negation, dialogue, review).
pub const MODULES_PER_PLANET: usize = 10;

/// How many times the learner must produce a structure correctly before the
/// tutor may call it learned. The spec's "pelo menos três produções".
pub const REQUIRED_PRODUCTIONS: u32 = 3;

/// What the app shows against each module, and what the tutor is allowed to
/// open. Exactly one module in a planet is `Current`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleState {
    /// Earlier modules are unfinished — not reachable yet.
    Locked,
    /// Reachable: the conversation has not been completed.
    Current,
    /// Conversation done, flashcards still pending — the module is not over.
    FlashcardsPending,
    /// Conversation and flashcards both done.
    Completed,
}

impl ModuleState {
    pub fn as_str(self) -> &'static str {
        match self {
            ModuleState::Locked => "locked",
            ModuleState::Current => "current",
            ModuleState::FlashcardsPending => "flashcards_pending",
            ModuleState::Completed => "completed",
        }
    }

    pub fn is_completed(self) -> bool {
        self == ModuleState::Completed
    }
}

/// The state of every module of a planet, in curriculum order.
///
/// The rule is strictly sequential: a module opens only once the one before
/// it is completely finished, so a learner can never be mid-way through two
/// modules at once, and can never skip ahead.
pub fn module_states(
    lessons: &[PlanetLesson],
    progress: &HashMap<Uuid, ModuleProgress>,
) -> Vec<ModuleState> {
    let mut out = Vec::with_capacity(lessons.len());
    let mut previous_completed = true; // module 1 is always reachable
    for lesson in lessons {
        let p = progress.get(&lesson.id);
        let state = if !previous_completed {
            ModuleState::Locked
        } else if p.is_some_and(ModuleProgress::completed) {
            ModuleState::Completed
        } else if p.is_some_and(|p| p.conversation_done) {
            ModuleState::FlashcardsPending
        } else {
            ModuleState::Current
        };
        previous_completed = state.is_completed();
        out.push(state);
    }
    out
}

/// The module the learner is on: the first one not yet completed. `None` once
/// the whole planet is finished.
pub fn current_module<'a>(
    lessons: &'a [PlanetLesson],
    progress: &HashMap<Uuid, ModuleProgress>,
) -> Option<&'a PlanetLesson> {
    let states = module_states(lessons, progress);
    lessons
        .iter()
        .zip(states)
        .find(|(_, state)| !state.is_completed())
        .map(|(lesson, _)| lesson)
}

/// True once every module of the planet is finished — the gate on the
/// planet's audio story.
pub fn planet_completed(
    lessons: &[PlanetLesson],
    progress: &HashMap<Uuid, ModuleProgress>,
) -> bool {
    !lessons.is_empty()
        && module_states(lessons, progress)
            .iter()
            .all(|s| s.is_completed())
}

/// How many of the planet's modules are finished — the "7 of 10 blocks"
/// number the app shows.
pub fn completed_count(
    lessons: &[PlanetLesson],
    progress: &HashMap<Uuid, ModuleProgress>,
) -> i64 {
    module_states(lessons, progress)
        .iter()
        .filter(|s| s.is_completed())
        .count() as i64
}

/// One teachable chunk: the target-language phrase and its translation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Structure {
    pub target: String,
    pub base: String,
}

/// Reads a module's `structures` column. Malformed or half-filled entries are
/// dropped rather than reaching the tutor as empty lines it might improvise
/// around.
pub fn structures(value: &Value) -> Vec<Structure> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|s| {
                    let target = s["target"].as_str().unwrap_or("").trim();
                    let base = s["base"].as_str().unwrap_or("").trim();
                    (!target.is_empty()).then(|| Structure {
                        target: target.to_string(),
                        base: base.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The verbs a planet drills, from its `focus_verbs` column.
pub fn focus_verbs(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// The curriculum plan
// ---------------------------------------------------------------------------
//
// The system owns WHAT is taught; the tutor only decides how. That means the
// sequence lives here as data, not in a model's judgment: which three
// high-frequency verbs each planet drills, and what each of its ten modules
// does with them.
//
// The trios are ordered by how much of everyday speech they unlock, not by
// grammatical tidiness — the spec's "frequência de uso no inglês real". They
// are named by their English lemma because that is the pedagogical sequence;
// the generator renders each one into the course's own target language.

/// The three things a planet drills, filling module slots 1-3. Planets 1 and 2
/// carry themes rather than a verb trio (the spec starts with survival phrases
/// and the verb "to be" before the frequency list takes over).
pub fn focus_slots(planet_number: i32) -> [&'static str; 3] {
    match planet_number {
        1 => ["greetings", "introductions", "origin and residence"],
        2 => ["to be (am/is/are)", "subjects and connectors", "to be in context"],
        n => {
            let trios = VERB_TRIOS;
            // Planets past the curated list cycle back through it, so a course
            // longer than the plan never lands on an empty module.
            trios[((n - 3).max(0) as usize) % trios.len()]
        }
    }
}

/// High-frequency verb trios, planet 3 onward.
const VERB_TRIOS: &[[&str; 3]] = &[
    ["have", "need", "can"],
    ["go", "come", "want"],
    ["do", "make", "get"],
    ["like", "know", "think"],
    ["say", "tell", "ask"],
    ["see", "look", "watch"],
    ["eat", "drink", "buy"],
    ["work", "study", "live"],
    ["take", "give", "put"],
    ["find", "lose", "keep"],
    ["start", "stop", "finish"],
    ["help", "try", "learn"],
    ["speak", "listen", "understand"],
    ["feel", "seem", "become"],
    ["call", "meet", "visit"],
    ["open", "close", "leave"],
    ["read", "write", "send"],
    ["drive", "walk", "travel"],
    ["wait", "stay", "arrive"],
    ["pay", "sell", "cost"],
    ["bring", "carry", "move"],
    ["play", "run", "win"],
    ["sleep", "wake up", "rest"],
    ["cook", "clean", "wash"],
    ["choose", "decide", "prefer"],
    ["remember", "forget", "imagine"],
    ["believe", "hope", "wish"],
    ["change", "improve", "grow"],
    ["build", "break", "fix"],
    ["show", "explain", "teach"],
    ["happen", "continue", "return"],
    ["allow", "let", "avoid"],
    ["agree", "argue", "apologize"],
    ["worry", "care", "mind"],
    ["offer", "accept", "refuse"],
    ["suggest", "recommend", "advise"],
    ["expect", "plan", "prepare"],
    ["depend", "belong", "involve"],
    ["consider", "realize", "notice"],
    ["achieve", "manage", "succeed"],
    ["reduce", "increase", "affect"],
    ["describe", "compare", "discuss"],
    ["support", "protect", "share"],
    ["complain", "solve", "handle"],
    ["deserve", "owe", "afford"],
    ["borrow", "lend", "save"],
    ["hire", "apply", "quit"],
    ["deliver", "order", "return"],
    ["hurt", "heal", "recover"],
    ["celebrate", "invite", "join"],
    ["record", "measure", "check"],
    ["assume", "doubt", "admit"],
    ["insist", "pretend", "promise"],
    ["struggle", "overcome", "adapt"],
    ["negotiate", "convince", "persuade"],
    ["invest", "earn", "spend"],
    ["lead", "follow", "organize"],
    ["reflect", "wonder", "conclude"],
];

/// What module `position` (1-10) does. Slots 1-3 take the planet's three focus
/// items; the rest transform them, which is what makes a chunk reusable
/// instead of memorized.
pub fn module_role(position: i32, slots: &[&str; 3]) -> (String, String) {
    let (focus, description) = match position {
        1 => (format!("focus:{}", slots[0]), format!("Build sentences with {}.", slots[0])),
        2 => (format!("focus:{}", slots[1]), format!("Build sentences with {}.", slots[1])),
        3 => (format!("focus:{}", slots[2]), format!("Build sentences with {}.", slots[2])),
        4 => (
            "mix".to_string(),
            format!("Combine {}, {} and {} in one idea, joined with connectors.", slots[0], slots[1], slots[2]),
        ),
        5 => ("past".to_string(), "The same structures in the past.".to_string()),
        6 => ("future".to_string(), "The same structures in the future.".to_string()),
        7 => ("questions".to_string(), "Turn the structures into questions.".to_string()),
        8 => ("negation".to_string(), "Turn the structures into negatives.".to_string()),
        9 => (
            "dialogue".to_string(),
            "Questions and answers — freer conversation using everything so far.".to_string(),
        ),
        _ => (
            "review".to_string(),
            "Review and the planet's final challenge.".to_string(),
        ),
    };
    (focus, description)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;

    fn lesson(position: i32) -> PlanetLesson {
        PlanetLesson {
            id: Uuid::new_v4(),
            planet_id: Uuid::nil(),
            position,
            kind: "verb".into(),
            title: format!("Module {position}"),
            description: String::new(),
            focus: "verb:have".into(),
            structures: json!([{"target": "I have a car.", "base": "Eu tenho um carro."}]),
        }
    }

    fn progress(lesson_id: Uuid, conversation: bool, flashcards: bool) -> ModuleProgress {
        ModuleProgress {
            user_id: Uuid::nil(),
            lesson_id,
            conversation_done: conversation,
            flashcards_done: flashcards,
            weak_structures: json!([]),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn a_fresh_planet_opens_on_module_one_and_locks_the_rest() {
        let lessons: Vec<_> = (1..=10).map(lesson).collect();
        let states = module_states(&lessons, &HashMap::new());
        assert_eq!(states[0], ModuleState::Current);
        assert!(states[1..].iter().all(|s| *s == ModuleState::Locked));
        assert_eq!(current_module(&lessons, &HashMap::new()).unwrap().position, 1);
    }

    /// The heart of the spec: the conversation alone does not open the next
    /// module — the flashcards have to be cleared too.
    #[test]
    fn conversation_alone_does_not_unlock_the_next_module() {
        let lessons: Vec<_> = (1..=3).map(lesson).collect();
        let mut progress = HashMap::new();
        progress.insert(lessons[0].id, progress_done(&lessons[0], true, false));

        let states = module_states(&lessons, &progress);
        assert_eq!(states[0], ModuleState::FlashcardsPending);
        assert_eq!(states[1], ModuleState::Locked, "module 2 stays shut");
        // The learner is still on module 1 — the tutor must not move on.
        assert_eq!(current_module(&lessons, &progress).unwrap().id, lessons[0].id);
    }

    fn progress_done(l: &PlanetLesson, conversation: bool, flashcards: bool) -> ModuleProgress {
        progress(l.id, conversation, flashcards)
    }

    #[test]
    fn finishing_the_flashcards_opens_the_next_module() {
        let lessons: Vec<_> = (1..=3).map(lesson).collect();
        let mut progress = HashMap::new();
        progress.insert(lessons[0].id, progress_done(&lessons[0], true, true));

        let states = module_states(&lessons, &progress);
        assert_eq!(states[0], ModuleState::Completed);
        assert_eq!(states[1], ModuleState::Current);
        assert_eq!(states[2], ModuleState::Locked);
        assert_eq!(current_module(&lessons, &progress).unwrap().id, lessons[1].id);
        assert_eq!(completed_count(&lessons, &progress), 1);
    }

    /// Progress on a later module cannot pull it forward past a locked gap —
    /// otherwise a stray tool call could skip the curriculum.
    #[test]
    fn a_later_module_cannot_open_while_an_earlier_one_is_unfinished() {
        let lessons: Vec<_> = (1..=3).map(lesson).collect();
        let mut progress = HashMap::new();
        progress.insert(lessons[2].id, progress_done(&lessons[2], true, true));

        let states = module_states(&lessons, &progress);
        assert_eq!(states[0], ModuleState::Current);
        assert_eq!(states[1], ModuleState::Locked);
        assert_eq!(states[2], ModuleState::Locked, "cannot jump the queue");
        assert!(!planet_completed(&lessons, &progress));
    }

    #[test]
    fn the_planet_is_complete_only_when_every_module_is() {
        let lessons: Vec<_> = (1..=10).map(lesson).collect();
        let mut progress = HashMap::new();
        for l in &lessons[..9] {
            progress.insert(l.id, progress_done(l, true, true));
        }
        assert!(!planet_completed(&lessons, &progress));
        assert_eq!(completed_count(&lessons, &progress), 9);

        progress.insert(lessons[9].id, progress_done(&lessons[9], true, true));
        assert!(planet_completed(&lessons, &progress));
        assert_eq!(completed_count(&lessons, &progress), 10);
        assert!(current_module(&lessons, &progress).is_none());
    }

    #[test]
    fn structures_drop_entries_the_tutor_could_not_teach() {
        let parsed = structures(&json!([
            {"target": "I have a car.", "base": "Eu tenho um carro."},
            {"target": "   ", "base": "ignored"},
            {"base": "no target at all"},
        ]));
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].target, "I have a car.");
    }

    #[test]
    fn the_first_planets_teach_survival_phrases_before_the_verb_list() {
        assert_eq!(focus_slots(1)[0], "greetings");
        assert!(focus_slots(2)[0].starts_with("to be"));
        assert_eq!(focus_slots(3), ["have", "need", "can"]);
    }

    /// A course longer than the curated list must still hand every module a
    /// focus rather than running off the end.
    #[test]
    fn every_planet_of_the_course_gets_a_trio() {
        for n in 1..=60 {
            let slots = focus_slots(n);
            assert!(slots.iter().all(|s| !s.is_empty()), "planet {n}");
        }
    }

    #[test]
    fn the_ten_modules_follow_the_specs_shape() {
        let slots = focus_slots(3);
        let focuses: Vec<String> = (1..=10).map(|p| module_role(p, &slots).0).collect();
        assert_eq!(focuses[0], "focus:have");
        assert_eq!(focuses[3], "mix");
        assert_eq!(focuses[4], "past");
        assert_eq!(focuses[5], "future");
        assert_eq!(focuses[6], "questions");
        assert_eq!(focuses[7], "negation");
        assert_eq!(focuses[8], "dialogue");
        assert_eq!(focuses[9], "review");
    }

    #[test]
    fn focus_verbs_are_read_as_a_clean_list() {
        assert_eq!(
            focus_verbs(&json!(["have", " need ", "", "can"])),
            vec!["have", "need", "can"]
        );
        assert!(focus_verbs(&json!(null)).is_empty());
    }
}
