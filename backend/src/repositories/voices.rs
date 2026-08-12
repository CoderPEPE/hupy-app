//! Tutor voice catalog persistence.

use crate::db::{run_db, DbPool};
use crate::errors::Result;
use crate::models::TutorVoice;
use crate::schema::tutor_voices;
use diesel::prelude::*;

/// The whole catalog, female group first, each group bright -> deep.
pub async fn list(pool: &DbPool) -> Result<Vec<TutorVoice>> {
    run_db(pool, move |conn| {
        Ok(tutor_voices::table
            .select(TutorVoice::as_select())
            // Name breaks pitch ties, so the picker order never shuffles.
            .order((
                tutor_voices::gender.asc(),
                tutor_voices::pitch_hz.desc(),
                tutor_voices::name.asc(),
            ))
            .load(conn)?)
    })
    .await
}

/// Whether `id` is a voice the tutor may actually speak with. Guards both the
/// stored preference (POST /api/auth/voice) and every Realtime session, so a
/// voice dropped from the catalog can't 400 a live session later.
pub async fn exists(pool: &DbPool, id: &str) -> Result<bool> {
    let id = id.to_string();
    run_db(pool, move |conn| {
        Ok(diesel::select(diesel::dsl::exists(tutor_voices::table.find(id))).get_result(conn)?)
    })
    .await
}
