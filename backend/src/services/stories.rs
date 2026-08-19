//! Personalized audio-story builder.
//!
//! Each planet earns one final audio story after all ten blocks are done.
//! The story is a first-person narrative in the target language that weaves
//! together the exact sentences the learner studied on that planet (the
//! spec: "The AI must create a personalized, educational story using the
//! vocabulary learned in the planet, sentences studied in the blocks…"),
//! plus important phrases from earlier planets so the audio is cumulative.
//!
//! Two writers produce it:
//!
//! * [`generate_with_ai`] — the spec's default. A chat model writes a real
//!   narrative (beginning, development, ending) of the length the learner's
//!   phase calls for, constrained to the sentences and structures listed in
//!   the prompt.
//! * [`build_story`] — a deterministic template used when no API key is
//!   configured or the model call fails, so a conquered planet always has a
//!   story to play. Shorter, but never broken.
//!
//! Level is derived from the planet's position so the narrative stays inside
//! structures the learner has actually been taught (A1 keeps simple joins,
//! C1 gets richer discourse connectors). Personalization is limited to the
//! learner's name — never their private data, unless later authorized.

use crate::errors::{AppError, Result};
use crate::models::Planet;

/// How many earlier-planet phrases the cumulative review section draws on.
pub const REVIEW_SENTENCES: i64 = 12;

/// Narration pace used to turn a target duration into a word budget and a
/// word count back into a duration (≈150 wpm).
const WORDS_PER_SECOND: f64 = 2.5;

/// Words in a typical spoken unit, used to turn the word budget into the
/// sentence count the prompt asks for.
const WORDS_PER_UNIT: f64 = 11.0;

/// Scenes the narrative is broken into. Enough to carry a beginning, a
/// development and an ending with room in between; few enough that each one
/// is a substantial stretch of story rather than a paragraph.
const SCENES: u32 = 8;

/// The built story: an ordered list of spoken transcript units in the target
/// language, a 1:1 base-language translation per unit (empty where no base
/// text exists, e.g. the narrative frame), and an estimated duration.
pub struct StoryText {
    pub title: String,
    pub sentences: Vec<String>,
    pub translation: Vec<String>,
    pub duration_secs: i64,
}

/// Which of the six narrative styles a planet uses (1 = A1 … 6 = C1).
fn phase_for(planet: &Planet) -> usize {
    match planet.number {
        1..=10 => 0,
        11..=20 => 1,
        21..=30 => 2,
        31..=40 => 3,
        41..=50 => 4,
        _ => 5,
    }
}

/// The story's target length, in minutes. The spec asks for "aproximadamente
/// 20 minutos" of listening per planet — long enough to fill a commute — so
/// every planet aims at the same band, with the early ones allowed to land a
/// little shorter because their structures are simpler and repeat sooner.
pub fn target_minutes(planet: &Planet) -> (u32, u32) {
    match phase_for(planet) {
        0 | 1 => (16, 20),
        _ => (18, 20),
    }
}

/// First-person story openings, per phase. `{name}` is the learner's name.
const INTROS: [&str; 6] = [
    "Hello! My name is {name}. This is a little story about my life.",
    "Hello! My name is {name}. Today I want to tell you a story about my life.",
    "Hello! My name is {name}. Let me tell you a story about something that happened to me.",
    "Good morning. My name is {name}. I would like to share a story with you.",
    "Hello, my name is {name}. Let me walk you through a story from my experience.",
    "Hello, I'm {name}. Let me take you on a journey — a story about my life.",
];

/// Openings when the learner has not set a name yet.
const INTROS_NO_NAME: [&str; 6] = [
    "Hello! This is a little story about my life.",
    "Hello! Today I want to tell you a story about my life.",
    "Hello! Let me tell you a story about something that happened to me.",
    "Good morning. I would like to share a story with you.",
    "Hello. Let me walk you through a story from my experience.",
    "Hello. Let me take you on a journey — a story about my life.",
];

/// Connectors cycled between the planet's sentences, per phase.
const CONNECTORS: [&[&str]; 6] = [
    &["Then", "After that", "After that", "Then", "After that"],
    &["After that", "Later", "Then", "The next day", "After that"],
    &[
        "After that",
        "Later on",
        "Meanwhile",
        "In the meantime",
        "After a while",
    ],
    &[
        "As it turned out",
        "After a while",
        "Interestingly enough",
        "Meanwhile",
        "Shortly after",
    ],
    &[
        "As it turned out",
        "In the end",
        "After a while",
        "Before long",
        "As expected",
    ],
    &[
        "Little by little",
        "As time went by",
        "Before I knew it",
        "In the end",
        "Gradually",
    ],
];

/// Story closings, per phase.
const OUTROS: [&str; 6] = [
    "That is the end of my story. Thank you for listening. Goodbye!",
    "That is my story. Thank you for listening. See you next time!",
    "And that is how it happened. Thank you for listening — see you next time.",
    "And that, in the end, is the whole story. Thank you for listening.",
    "And that is the story from my experience. Thank you for listening.",
    "And so the story goes. Thank you for listening — until next time.",
];

/// Lead-ins to the cumulative review section, per phase.
const REVIEW_LEADS: [&str; 6] = [
    "Now let's remember some things I learned before.",
    "Before I finish, let me remember a few things from earlier.",
    "Let me also look back at some things I learned earlier on.",
    "Before wrapping up, it's worth revisiting a few earlier points.",
    "Let me briefly return to a few things I picked up earlier.",
    "Looking back, a few earlier lessons still come to mind.",
];

pub fn duration_secs(units: &[String]) -> i64 {
    let words: usize = units.iter().map(|u| u.split_whitespace().count()).sum();
    (words as f64 / WORDS_PER_SECOND).ceil() as i64
}

/// Builds the personalized story for one planet from its own sentences,
/// closing with a short cumulative review of earlier-planet phrases.
///
/// This is the fallback writer: it is always available and never fails, but
/// it stays close to the source sentences, so it runs shorter than the
/// spec's duration bands. [`generate_with_ai`] is the primary path.
pub fn build_story(
    planet: &Planet,
    chunks: &[(String, String)],
    review: &[(String, String)],
    name: &str,
) -> StoryText {
    let phase = phase_for(planet);
    let intro = if name.trim().is_empty() {
        INTROS_NO_NAME[phase].to_string()
    } else {
        INTROS[phase].replace("{name}", name.trim())
    };

    let connectors = CONNECTORS[phase];
    let mut units = vec![intro];
    let mut translation = vec![String::new()];

    for (i, (target, base)) in chunks.iter().enumerate() {
        let connector = if i == 0 {
            String::new()
        } else {
            // "After that, " — spoken as part of the same unit, keeping the
            // translation aligned 1:1 with the planet's sentence.
            let c = connectors[(i - 1) % connectors.len()];
            if c.ends_with(',') {
                format!("{} ", c)
            } else {
                format!("{c}, ")
            }
        };
        units.push(format!("{connector}{target}"));
        translation.push(base.clone());
    }

    if !review.is_empty() {
        units.push(REVIEW_LEADS[phase].to_string());
        translation.push(String::new());
        for (target, base) in review {
            units.push(target.clone());
            translation.push(base.clone());
        }
    }

    units.push(OUTROS[phase].to_string());
    translation.push(String::new());

    StoryText {
        title: format!("{} — My Story", planet.title),
        duration_secs: duration_secs(&units),
        sentences: units,
        translation,
    }
}

// ---------------------------------------------------------------------------
// AI writer
// ---------------------------------------------------------------------------

/// The story brief handed to the chat model. Every constraint the spec puts
/// on the narrative lives here: only taught structures, a real beginning /
/// development / ending, cumulative review, and the level's duration band.
pub fn story_prompt(
    planet: &Planet,
    modules: &[(String, Vec<(String, String)>)],
    review: &[(String, String)],
    name: &str,
    target_name: &str,
    base_name: &str,
) -> String {
    let (min_min, max_min) = target_minutes(planet);
    // 150 wpm narration; aim at the middle of the band so a slightly long or
    // short generation still lands inside it.
    let words = ((min_min + max_min) as f64 / 2.0 * 150.0).round() as u32;
    // A word budget alone gets ignored — models happily return 200 words and
    // call it 1500. A sentence count and a scene outline are concrete enough
    // to actually steer the length.
    let units = (f64::from(words) / WORDS_PER_UNIT).round() as u32;
    let scenes = SCENES;
    let per_scene = units.div_ceil(scenes);

    let mut out = String::new();
    out.push_str(&format!(
        "Write a personalized audio story in {target_name} for a language learner at CEFR level {}.\n\n",
        planet.level
    ));
    out.push_str(&format!(
        "PLANET {}: {} — {}\nCommunication goal: {}\n\n",
        planet.number, planet.title, planet.subtitle, planet.goal
    ));
    if name.trim().is_empty() {
        out.push_str("The learner has not shared their name — write in the first person without naming the narrator.\n\n");
    } else {
        out.push_str(&format!(
            "The narrator is the learner, named {}. Write in the first person as them.\n\n",
            name.trim()
        ));
    }

    out.push_str(
        "WHAT THEY STUDIED ON THIS PLANET, module by module — the story's backbone. \
         The learner has said these out loud; hearing them again is the whole point, so use them \
         (or very close variations) throughout:\n",
    );
    for (title, chunks) in modules {
        out.push_str(&format!("\n{title}:\n"));
        for (target, base) in chunks {
            out.push_str(&format!("- {target} ({base})\n"));
        }
    }
    if !review.is_empty() {
        out.push_str(
            "\nEARLIER-PLANET PHRASES — weave a handful of these in naturally as review:\n",
        );
        for (target, base) in review {
            out.push_str(&format!("- {target} ({base})\n"));
        }
    }

    out.push_str(&format!(
        "\nLENGTH — this is the hardest requirement, do not shortchange it:\n\
- Produce AT LEAST {units} units (sentences). Roughly {words} words of {target_name} in total.\n\
- That is about {min_min}–{max_min} minutes read aloud. Never longer than 20 minutes.\n\
- Build it as {scenes} scenes of about {per_scene} sentences each, flowing into one another.\n\
  Give each scene a place, a moment and something that happens; describe what the narrator\n\
  sees, does, says and feels, so the length comes from real storytelling rather than repetition.\n\
- A short story is a failed story here. Keep writing until you have {units} units.\n\
\n\
RULES:\n\
- A real story: a clear beginning, a development, and an ending. Not a list of sentences.\n\
- The learner must recognise their own lessons in it. Most sentences should be a studied chunk or a \
close variation of one — a different subject, tense or object. This is not a podcast of new material: \
if they finish it thinking \"I understood that because I studied it\", it worked.\n\
- Use ONLY grammar, vocabulary and verb tenses at or below level {level}. Never introduce a structure the learner has not been taught.\n\
- Most of the content comes from this planet; the earlier phrases are review, not the focus.\n\
- Short, spoken sentences — this is listened to while driving.\n\
- Never repeat a sentence verbatim to pad the length; vary the situation instead.\n\
- Do not address the learner or explain the language. Just tell the story.\n\
\n\
Return JSON only: {{\"title\": string, \"units\": [{{\"text\": <one sentence in {target_name}>, \"translation\": <the same sentence in {base_name}>}}]}}\n\
One sentence per unit, in reading order.",
        level = planet.level,
    ));
    out
}

/// How many continuation calls a story may take before we accept what we
/// have. One request tops out around 800 words whatever the prompt asks for,
/// so reaching the 15–20 minute band needs a few passes.
const MAX_CONTINUATIONS: usize = 3;

/// Total words for the low end of a planet's duration band.
fn min_words(planet: &Planet) -> usize {
    (f64::from(target_minutes(planet).0) * 60.0 * WORDS_PER_SECOND) as usize
}

fn word_count(units: &[String]) -> usize {
    units.iter().map(|u| u.split_whitespace().count()).sum()
}

/// Writes the story with the chat model, continuing where the model stops
/// short. Errors (network, bad key, bad JSON) surface to the caller, which
/// falls back to [`build_story`].
pub async fn generate_with_ai(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    planet: &Planet,
    prompt: &str,
) -> Result<StoryText> {
    let mut story = request_story(client, api_key, model, prompt).await?;
    let target = min_words(planet);

    // Models reliably stop well short of a long word budget in one pass, and
    // the spec's bands are the point of the feature — so ask for the rest
    // instead of shipping a three-minute "20-minute" story.
    for _ in 0..MAX_CONTINUATIONS {
        let have = word_count(&story.sentences);
        if have >= target {
            break;
        }
        let tail: Vec<&str> = story
            .sentences
            .iter()
            .rev()
            .take(12)
            .rev()
            .map(String::as_str)
            .collect();
        let more = ((target - have) as f64 / WORDS_PER_UNIT).ceil() as usize;
        let follow = format!(
            "{prompt}\n\n\
---\n\
You already wrote {have} words of this story. It ends like this:\n\
{}\n\n\
CONTINUE the same story from exactly there. Return ONLY the new units — do not repeat any \
of the text above. Add at least {more} more units ({} more words), keeping the same narrator, \
level and style, and bring the story to a proper ending in this batch.",
            tail.join("\n"),
            target.saturating_sub(have),
        );
        match request_story(client, api_key, model, &follow).await {
            Ok(next) => {
                story.sentences.extend(next.sentences);
                story.translation.extend(next.translation);
            }
            // A failed continuation still leaves a complete, playable story.
            Err(e) => {
                tracing::warn!("story continuation failed, keeping what we have: {e:?}");
                break;
            }
        }
    }

    story.duration_secs = duration_secs(&story.sentences);
    Ok(story)
}

/// One chat completion, parsed into a story.
async fn request_story(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<StoryText> {
    let payload = serde_json::json!({
        "model": model,
        "response_format": {"type": "json_object"},
        // A 20-minute story plus its translation is a long JSON document; the
        // default cap would truncate it into invalid JSON.
        "max_tokens": 16000,
        "messages": [{"role": "user", "content": prompt}],
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach OpenAI: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let body: String = resp
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(300)
            .collect();
        return Err(AppError::internal(format!(
            "story generation failed ({status}): {body}"
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::internal(format!("malformed OpenAI response: {e}")))?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| AppError::internal("OpenAI response carried no story"))?;
    parse_story(content)
}

/// Parses the model's JSON into aligned transcript/translation arrays.
/// Units missing a `text` are dropped rather than producing silent gaps.
pub fn parse_story(content: &str) -> Result<StoryText> {
    let parsed: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| AppError::internal(format!("story JSON was not valid: {e}")))?;
    let title = parsed["title"].as_str().unwrap_or("My Story").to_string();

    let mut sentences = Vec::new();
    let mut translation = Vec::new();
    for unit in parsed["units"].as_array().into_iter().flatten() {
        let text = unit["text"].as_str().unwrap_or("").trim();
        if text.is_empty() {
            continue;
        }
        sentences.push(text.to_string());
        translation.push(
            unit["translation"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string(),
        );
    }
    if sentences.is_empty() {
        return Err(AppError::internal("story JSON contained no usable units"));
    }

    Ok(StoryText {
        title,
        duration_secs: duration_secs(&sentences),
        sentences,
        translation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Planet;
    use uuid::Uuid;

    fn planet(number: i32) -> Planet {
        Planet {
            id: Uuid::nil(),
            number,
            title: "Test".into(),
            subtitle: String::new(),
            color: String::new(),
            topics: serde_json::json!([]),
            unlock_mastery: 0.8,
            created_at: chrono::Utc::now(),
            language: "en".into(),
            base_language: "pt".into(),
            level: "A1".into(),
            goal: String::new(),
            focus_verbs: serde_json::json!([]),
        }
    }

    /// One studied chunk: (target, base).
    fn chunk(target: &str, base: &str) -> (String, String) {
        (target.into(), base.into())
    }

    #[test]
    fn story_opens_with_the_learner_name() {
        let p = planet(1);
        let story = build_story(
            &p,
            &[chunk("I am from Brazil.", "Sou do Brasil.")],
            &[],
            "Sergio",
        );
        assert!(story.sentences[0].contains("Sergio"));
        assert!(story.sentences[1].contains("I am from Brazil."));
        assert_eq!(story.translation[1], "Sou do Brasil.");
        // The closing is a spoken unit too.
        assert!(story.sentences.last().unwrap().contains("story"));
    }

    #[test]
    fn story_omits_name_when_absent() {
        let p = planet(1);
        let story = build_story(&p, &[chunk("I am from Brazil.", "Sou do Brasil.")], &[], "");
        assert!(!story.sentences[0].contains("My name is"));
        assert!(story.sentences[0].contains("This is a little story"));
    }

    #[test]
    fn sentences_are_joined_with_connectors() {
        let p = planet(5); // A1
        let story = build_story(
            &p,
            &[
                chunk("I work every day.", "Trabalho todos os dias."),
                chunk("I eat dinner at seven.", "Janto às sete."),
            ],
            &[],
            "Ana",
        );
        assert_eq!(story.sentences.len(), 4); // intro + 2 sentences + outro
        assert!(
            story.sentences[2].starts_with("Then,")
                || story.sentences[2].starts_with("After that,")
        );
    }

    #[test]
    fn duration_is_estimated_from_word_count() {
        let p = planet(1);
        let story = build_story(
            &p,
            &[chunk("I am from Brazil.", "Sou do Brasil.")],
            &[],
            "Sergio",
        );
        assert!(story.duration_secs > 0);
    }

    #[test]
    fn translation_array_aligns_one_to_one() {
        let p = planet(21); // B1 — connector format unchanged
        let story = build_story(
            &p,
            &[chunk("I had a great time.", "Eu me diverti muito.")],
            &[],
            "João",
        );
        assert_eq!(story.sentences.len(), story.translation.len());
        assert_eq!(story.translation[1], "Eu me diverti muito.");
        assert!(story.translation[0].is_empty());
    }

    /// The audio is cumulative: earlier-planet phrases get their own review
    /// act before the closing, translations still aligned 1:1.
    #[test]
    fn earlier_phrases_are_reviewed_before_the_ending() {
        let p = planet(12);
        let review = vec![(
            "I am from Brazil.".to_string(),
            "Sou do Brasil.".to_string(),
        )];
        let story = build_story(
            &p,
            &[chunk("I clean the house.", "Limpo a casa.")],
            &review,
            "Ana",
        );
        assert_eq!(story.sentences.len(), story.translation.len());
        let review_at = story
            .sentences
            .iter()
            .position(|u| u == "I am from Brazil.")
            .expect("the earlier phrase is spoken");
        assert_eq!(story.translation[review_at], "Sou do Brasil.");
        // It sits after the planet's own content and before the closing.
        assert!(review_at > 1);
        assert!(review_at < story.sentences.len() - 1);
    }

    /// The spec asks for roughly twenty minutes of listening per planet, so
    /// every planet aims there — the early ones from a little lower.
    #[test]
    fn every_planet_aims_at_about_twenty_minutes() {
        for n in [1, 3, 15, 25, 45, 60] {
            let (low, high) = target_minutes(&planet(n));
            assert_eq!(high, 20, "planet {n} should aim at 20 minutes");
            assert!(low >= 16, "planet {n} floor is {low}, too short");
        }
    }

    #[test]
    fn the_prompt_states_the_level_and_carries_the_studied_sentences() {
        let p = planet(1);
        let prompt = story_prompt(
            &p,
            &[(
                "Module 1 — Greetings".to_string(),
                vec![chunk("I am from Brazil.", "Sou do Brasil.")],
            )],
            &[("I work.".into(), "Eu trabalho.".into())],
            "Sergio",
            "English",
            "Portuguese",
        );
        assert!(prompt.contains("A1"));
        assert!(prompt.contains("Sergio"));
        assert!(prompt.contains("I am from Brazil."));
        assert!(prompt.contains("I work."));
        assert!(prompt.contains("16–20 minutes"));
        // The concrete sentence count is what actually steers the length —
        // a word budget alone gets ignored.
        assert!(prompt.contains("AT LEAST 245 units"), "{prompt}");
        // The story is built from the modules the learner worked through.
        assert!(prompt.contains("Module 1 — Greetings"), "{prompt}");
    }

    #[test]
    fn ai_story_json_parses_into_aligned_arrays() {
        let story = parse_story(
            r#"{"title":"A Day in Orlando","units":[
                {"text":"My name is Sergio.","translation":"Meu nome é Sergio."},
                {"text":"   ","translation":"ignored"},
                {"text":"I live in Florida.","translation":"Eu moro na Flórida."}
            ]}"#,
        )
        .expect("valid story JSON");
        assert_eq!(story.title, "A Day in Orlando");
        // The blank unit is dropped rather than becoming a silent gap.
        assert_eq!(story.sentences.len(), 2);
        assert_eq!(story.translation.len(), 2);
        assert_eq!(story.translation[1], "Eu moro na Flórida.");
        assert!(story.duration_secs > 0);
    }

    #[test]
    fn unusable_ai_output_is_an_error_so_the_template_takes_over() {
        assert!(parse_story("not json").is_err());
        assert!(parse_story(r#"{"title":"x","units":[]}"#).is_err());
    }
}
