-- ---------------------------------------------------------------------------
-- Tutor voice preference.
--
-- The learner can pick the AI tutor's voice (male / female actor) in the
-- app settings. Store the OpenAI voice id; empty means "auto" — the session
-- falls back to the course's default voice (marin for English, coral for
-- Spanish, shimmer for Portuguese).
-- ---------------------------------------------------------------------------

ALTER TABLE users
    ADD COLUMN voice VARCHAR(64) NOT NULL DEFAULT '';
