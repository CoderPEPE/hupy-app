use crate::schema::tutor_voices;
use diesel::prelude::*;
use serde::Serialize;

/// One selectable tutor voice from the DB catalog (`tutor_voices`). Serialized
/// straight to the app — the picker renders the groups and names from this,
/// so a relabeled voice needs no app release.
#[derive(Debug, Clone, Queryable, Selectable, Serialize)]
#[diesel(table_name = tutor_voices)]
pub struct TutorVoice {
    /// The OpenAI voice id, stored on `users.voice` and sent to /api/tts.
    pub id: String,
    pub name: String,
    /// 'female' | 'male' — grouping in the picker.
    pub gender: String,
    /// Measured median fundamental frequency; orders each group bright -> deep.
    pub pitch_hz: i32,
}
