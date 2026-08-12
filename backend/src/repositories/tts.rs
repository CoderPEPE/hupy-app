//! TTS audio cache persistence.

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::schema::tts_audio;
use chrono::Utc;
use diesel::prelude::*;
use diesel::OptionalExtension;

pub async fn audio_by_key(pool: &DbPool, cache_key: &str) -> Result<Option<Vec<u8>>> {
    let cache_key = cache_key.to_string();
    run_db(pool, move |conn| {
        Ok(tts_audio::table
            .find(cache_key)
            .select(tts_audio::audio)
            .first::<Vec<u8>>(conn)
            .optional()?)
    })
    .await
}

/// Best-effort cache write (callers log and swallow failures — a cache write
/// must never fail the request the user already waited for). Opportunistically
/// prunes entries older than `max_age_days`, so the cache stays bounded
/// without a scheduled job (every new clip sweeps the expired tail).
///
/// Each argument maps one-to-one onto a `tts_audio` column; a struct would
/// just add indirection to a single-call-site write.
#[allow(clippy::too_many_arguments)]
pub async fn store_audio(
    pool: &DbPool,
    cache_key: String,
    text: String,
    voice: String,
    model: String,
    speed: f64,
    audio: Vec<u8>,
    max_age_days: i64,
) -> Result<()> {
    run_db(pool, move |conn| {
        diesel::insert_into(tts_audio::table)
            .values((
                tts_audio::cache_key.eq(cache_key),
                tts_audio::text.eq(text),
                tts_audio::voice.eq(voice),
                tts_audio::model.eq(model),
                tts_audio::speed.eq(speed),
                tts_audio::audio.eq(audio),
            ))
            .on_conflict(tts_audio::cache_key)
            .do_nothing()
            .execute(conn)?;

        let cutoff = Utc::now() - chrono::Duration::days(max_age_days);
        diesel::delete(tts_audio::table.filter(tts_audio::created_at.lt(cutoff))).execute(conn)?;
        Ok(())
    })
    .await
}
