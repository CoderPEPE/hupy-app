//! Database entity structs (the "domain model" layer).
//!
//! Every row struct used by the repositories lives here, so a schema change
//! is visible in exactly one place and no handler file carries its own
//! private copy of a table. Structs here are deliberately dumb data carriers
//! — no HTTP, no behavior beyond small self-explanatory constructors.

pub mod conversation;
pub mod flashcard;
pub mod gamification;
pub mod planet;
pub mod user;
pub mod voice;

pub use conversation::{Conversation, Correction, Message, NewCorrection, NewMessage};
pub use flashcard::{Card, NewCard};
pub use gamification::UserStats;
pub use planet::{ActivePlanet, LessonStep, Planet, PlanetProgress, Sentence, TutorSentence};
pub use user::{NewUser, User};
pub use voice::TutorVoice;
