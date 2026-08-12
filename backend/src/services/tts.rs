//! Text-to-speech orchestration: cache keys and the OpenAI synthesis call.
//! The HTTP handler owns request validation and cache reads/writes; this
//! module owns the pure logic and the outbound API call.

use crate::errors::{AppError, Result};

/// Deterministic 64-bit FNV-1a key over (text, voice, model, speed) — good
/// enough to dedupe generated audio; no crypto needed for a cache key.
pub fn cache_key(text: &str, voice: &str, model: &str, speed: f32) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{text}\u{1f}{voice}\u{1f}{model}\u{1f}{speed}").bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Generates MP3 audio for `text` via the OpenAI speech API. The API key
/// never leaves the server. Uses the shared, timeout-bounded HTTP client so
/// a hung upstream fails the request instead of holding a handler forever.
pub async fn synthesize(
    client: &reqwest::Client,
    api_key: &str,
    text: &str,
    voice: &str,
    model: &str,
    speed: f32,
) -> Result<Vec<u8>> {
    let payload = serde_json::json!({
        "model": model,
        "voice": voice,
        "input": text,
        "speed": speed,
        "response_format": "mp3",
    });

    let resp = client
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(api_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::internal(format!("failed to reach OpenAI TTS: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let err: serde_json::Value = resp.json().await.unwrap_or_else(|_| serde_json::json!({}));
        let message: String = err.to_string().chars().take(300).collect();
        return Err(AppError::internal(format!(
            "OpenAI TTS failed ({status}): {message}"
        )));
    }

    resp.bytes()
        .await
        .map_err(|e| AppError::internal(format!("failed to read TTS audio: {e}")))
        .map(|b| b.to_vec())
}

#[cfg(test)]
mod tests {
    use super::cache_key;

    #[test]
    fn cache_key_is_deterministic() {
        let a = cache_key("Good morning", "marin", "gpt-4o-mini-tts", 1.0);
        let b = cache_key("Good morning", "marin", "gpt-4o-mini-tts", 1.0);
        assert_eq!(a, b);
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn cache_key_differs_on_text_voice_or_speed() {
        assert_ne!(
            cache_key("Good morning", "marin", "m", 1.0),
            cache_key("Good night", "marin", "m", 1.0)
        );
        assert_ne!(
            cache_key("Good morning", "marin", "m", 1.0),
            cache_key("Good morning", "alloy", "m", 1.0)
        );
        assert_ne!(
            cache_key("Good morning", "marin", "m", 1.0),
            cache_key("Good morning", "marin", "m", 0.9)
        );
    }
}
