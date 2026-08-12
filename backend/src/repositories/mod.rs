//! Data-access layer (the "repositories").
//!
//! Every function here owns one database unit of work: it takes a pool,
//! runs a blocking Diesel closure off the async runtime, and returns a
//! domain type from [`crate::models`]. Handlers and services never touch
//! Diesel or the schema directly — they call these functions.
//!
//! Nothing in this layer knows about HTTP or JSON.

pub mod conversations;
pub mod flashcards;
pub mod gamification;
pub mod planets;
pub mod refresh_tokens;
pub mod stories;
pub mod tts;
pub mod users;
pub mod voices;
