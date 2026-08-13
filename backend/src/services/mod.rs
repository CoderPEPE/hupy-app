//! Business-logic layer (the "services").
//!
//! Pure domain rules (mastery math, unlock status, SRS scheduling, badge
//! thresholds, tutor prompt building) live here, separated from both HTTP
//! concerns and Diesel. Services orchestrate the repositories; nothing in
//! this layer knows about `axum` or JSON.

pub mod curriculum;
pub mod flashcards;
pub mod gamification;
pub mod planets;
pub mod realtime;
pub mod stories;
pub mod tts;
