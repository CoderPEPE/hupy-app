use crate::schema::{lesson_steps, planet_sentences, planets, user_planet_progress};
use chrono::{DateTime, Utc};
use diesel::{Queryable, Selectable};
use serde_json::Value;
use uuid::Uuid;

/// A planet in the course path (Mercury … Neptune). Field order MUST match the
/// `planets` table column order (diesel maps `Queryable` positionally):
/// `base_language` was appended after `language` by a migration.
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
    /// Which language this planet teaches (the target): 'en' | 'es' | 'pt'.
    pub language: String,
    /// The explanation language of this course (the learner's own): 'en' | 'es' | 'pt'.
    pub base_language: String,
}

/// A user's per-planet progress row. `mastery` is always the computed average
/// of the six sub-metrics — never written directly. `Clone` lets writers
/// apply [`crate::services::planets::with_metric`] to a locked copy.
#[derive(Debug, Clone, Queryable, Selectable)]
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
/// `pt` (the "back"). Every row carries all three languages, but the unused
/// slot may be empty for the newer (base, target) pairs, so the pair decides.
pub fn sentence_texts(s: &Sentence, target: &str, base: &str) -> (String, String) {
    match (target, base) {
        ("es", "pt") => (s.es.clone(), s.pt.clone()),
        ("pt", "en") => (s.pt.clone(), s.en.clone()),
        ("en", "es") => (s.en.clone(), s.es.clone()),
        ("es", "en") => (s.es.clone(), s.en.clone()),
        ("pt", "es") => (s.pt.clone(), s.es.clone()),
        // ("en", "pt") and any legacy fallback
        _ => (s.en.clone(), s.pt.clone()),
    }
}

/// When only a target is known, which base language the course explains from.
/// 'en'/'es' courses were originally taught from Portuguese, 'pt' from English.
pub fn default_base_for(target: &str) -> &'static str {
    match target {
        "pt" => "en",
        _ => "pt",
    }
}

#[cfg(test)]
mod tests {
    use super::{default_base_for, sentence_texts, Sentence};
    use uuid::Uuid;

    fn sample() -> Sentence {
        Sentence {
            id: Uuid::nil(),
            planet_id: Uuid::nil(),
            position: 1,
            en: "Good morning".into(),
            pt: "Bom dia".into(),
            subject: String::new(),
            verb: String::new(),
            complement: String::new(),
            es: "Buenos días".into(),
        }
    }

    /// Every (target, base) pair must read the right columns — the newest
    /// courses leave the unused slot empty, so a wrong mapping would surface
    /// empty front/back texts in the app.
    #[test]
    fn sentence_texts_cover_all_six_pairs() {
        let s = sample();
        assert_eq!(
            sentence_texts(&s, "en", "pt"),
            ("Good morning".into(), "Bom dia".into())
        );
        assert_eq!(
            sentence_texts(&s, "es", "pt"),
            ("Buenos días".into(), "Bom dia".into())
        );
        assert_eq!(
            sentence_texts(&s, "pt", "en"),
            ("Bom dia".into(), "Good morning".into())
        );
        assert_eq!(
            sentence_texts(&s, "en", "es"),
            ("Good morning".into(), "Buenos días".into())
        );
        assert_eq!(
            sentence_texts(&s, "es", "en"),
            ("Buenos días".into(), "Good morning".into())
        );
        assert_eq!(
            sentence_texts(&s, "pt", "es"),
            ("Bom dia".into(), "Buenos días".into())
        );
    }

    #[test]
    fn default_base_falls_back_sensibly() {
        assert_eq!(default_base_for("pt"), "en");
        assert_eq!(default_base_for("en"), "pt");
        assert_eq!(default_base_for("es"), "pt");
        assert_eq!(default_base_for("xx"), "pt");
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
    pub base_language: String,
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
