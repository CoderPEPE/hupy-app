use crate::schema::{lesson_steps, planet_sentences, planets, user_planet_progress};
use chrono::{DateTime, Utc};
use diesel::{Queryable, Selectable};
use serde_json::Value;
use uuid::Uuid;

/// A planet in the course path (Mercury … Neptune).
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = planets)]
pub struct Planet {
    pub id: Uuid,
    pub number: i32,
    pub title: String,
    pub subtitle: String,
    pub color: String,
    pub topics: Value,
    pub unlock_mastery: f64,
    pub created_at: DateTime<Utc>,
    /// Which target language this planet belongs to: 'en' | 'es' | 'pt'.
    pub language: String,
}

/// A user's per-planet progress row. `mastery` is always the computed average
/// of the six sub-metrics — never written directly.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = user_planet_progress)]
pub struct PlanetProgress {
    #[allow(dead_code)] // owned implicitly via the composite key on the row
    pub user_id: Uuid,
    pub planet_id: Uuid,
    pub sentences: f64,
    pub pronunciation: f64,
    pub conversation: f64,
    pub listening: f64,
    pub flashcards: f64,
    pub review: f64,
    pub mastery: f64,
}

impl PlanetProgress {
    /// The zeroed progress row used when a user has never touched a planet.
    pub fn empty(planet_id: Uuid) -> Self {
        Self {
            user_id: Uuid::nil(),
            planet_id,
            sentences: 0.0,
            pronunciation: 0.0,
            conversation: 0.0,
            listening: 0.0,
            flashcards: 0.0,
            review: 0.0,
            mastery: 0.0,
        }
    }

    /// Reads one sub-metric by name; unknown names read as 0.0.
    pub fn metric(&self, name: &str) -> f64 {
        match name {
            "sentences" => self.sentences,
            "pronunciation" => self.pronunciation,
            "conversation" => self.conversation,
            "listening" => self.listening,
            "flashcards" => self.flashcards,
            "review" => self.review,
            "mastery" => self.mastery,
            _ => 0.0,
        }
    }
}

/// One sentence of a planet's course content.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = planet_sentences)]
pub struct Sentence {
    pub id: Uuid,
    #[allow(dead_code)] // required by Queryable; not part of any response shape
    pub planet_id: Uuid,
    pub position: i32,
    pub en: String,
    pub pt: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub es: String,
}

/// Picks the (target, base) sentence texts for a course: the target goes in
/// the `en` slot (the "front" text the app teaches), the base translation in
/// `pt` (the "back").
pub fn sentence_texts(s: &Sentence, language: &str) -> (String, String) {
    match language {
        "es" => (s.es.clone(), s.pt.clone()),
        "pt" => (s.pt.clone(), s.en.clone()),
        _ => (s.en.clone(), s.pt.clone()),
    }
}

/// One step of the scripted planet lesson (teach / repeat / question /
/// correction / review / praise). Correction columns are optional — a step
/// only carries a correction when `kind = "correction"`.
#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = lesson_steps)]
pub struct LessonStep {
    pub id: Uuid,
    #[allow(dead_code)] // required by Queryable; not part of any response shape
    pub planet_id: Uuid,
    #[allow(dead_code)] // required by Queryable; rows are loaded already ordered
    pub position: i32,
    pub kind: String,
    pub tutor_text: String,
    pub expected_text: Option<String>,
    pub mastery_gain: Option<f64>,
    pub correction_said: Option<String>,
    pub correction_corrected: Option<String>,
    pub correction_explanation: Option<String>,
    pub correction_pt: Option<String>,
    pub correction_mistake_part: Option<String>,
    pub correction_subject: Option<String>,
    pub correction_verb: Option<String>,
    pub correction_complement: Option<String>,
}

/// The planet the tutor can teach right now (first non-completed by number).
pub struct ActivePlanet {
    pub id: Uuid,
    pub number: i32,
    pub title: String,
    pub language: String,
}

/// One sentence from the active planet, with whether this user has mastered it.
pub struct TutorSentence {
    pub id: Uuid,
    /// The sentence in the course's target language (the front text).
    pub en: String,
    /// The base-language translation (the back text).
    pub pt: String,
    pub subject: String,
    pub verb: String,
    pub complement: String,
    pub mastered: bool,
}
