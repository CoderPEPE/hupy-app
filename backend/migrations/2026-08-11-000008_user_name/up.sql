-- ---------------------------------------------------------------------------
-- users.name — the learner's real display name.
--
-- Accounts were created with only an email, so every screen that needed a
-- name (profile header, chat greeting, the tutor's spoken address, the voice
-- picker's "my name is {name}" preview) derived one from the email local part
-- — which produced literal email usernames like "test". This column lets the
-- registration form capture the real name; empty means "fall back to the
-- email-derived name" for pre-existing accounts.
-- ---------------------------------------------------------------------------

ALTER TABLE users
    ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT '';
