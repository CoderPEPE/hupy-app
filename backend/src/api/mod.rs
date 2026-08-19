//! HTTP layer (the "handlers"): routers, request/response DTOs, validation,
//! and the orchestration of repositories + services.
//!
//! This is the only layer that knows about `axum` and JSON. It must never
//! touch Diesel directly.

pub mod auth;
pub mod conversations;
pub mod flashcards;
pub mod gamification;
pub mod modules;
pub mod planets;
pub mod realtime;
pub mod stories;
pub mod tts;
pub mod voices;
