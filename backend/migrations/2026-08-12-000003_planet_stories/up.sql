-- ---------------------------------------------------------------------------
-- Personalized audio stories, one per (user, planet).
--
-- A planet's story is unlocked once the learner completes the planet (mastery
-- >= unlock threshold). The story text is generated server-side from the
-- planet's own sentences (the curriculum the learner actually studied) and
-- the learner's name — stored as an ordered transcript of spoken units in
-- the target language, with the base-language translation aligned 1:1 for
-- the optional translation view.
--
-- Playback position is stored per story so the player can resume exactly
-- where the learner stopped (the spec's "automatically resume from the last
-- position").
-- ---------------------------------------------------------------------------

CREATE TABLE planet_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    -- 'ready' | 'generating' | 'failed' (client plays sentence-by-sentence TTS)
    status TEXT NOT NULL DEFAULT 'ready',
    -- Ordered transcript units in the target language (JSON array of strings).
    sentences JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Aligned base-language translation per unit ('' where unavailable).
    translation JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_secs INT NOT NULL DEFAULT 0,
    position_secs INT NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, planet_id)
);

CREATE INDEX planet_stories_user_idx ON planet_stories (user_id);
