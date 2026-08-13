-- ---------------------------------------------------------------------------
-- Pre-generated audio stories, one per planet (not per user).
--
-- Stories used to be written on demand, per learner, when they conquered a
-- planet — which meant the Audio tab showed a "Generate" button and a wait.
-- The curriculum is the same for everyone on a course, so the story is too:
-- it is written once per planet by `seed_stories` (the AI writer, with the
-- deterministic template as fallback) and shipped with the database.
--
-- `planet_stories` stays as the per-learner row: it carries the playback
-- position, and is created from this seed the first time someone listens.
-- ---------------------------------------------------------------------------

CREATE TABLE planet_story_seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planet_id UUID NOT NULL UNIQUE REFERENCES planets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    -- Ordered transcript units in the planet's target language.
    sentences JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Aligned base-language translation per unit ('' where unavailable).
    translation JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_secs INT NOT NULL DEFAULT 0,
    -- Which writer produced it: the model id, or 'template' for the
    -- deterministic fallback. Lets a re-run replace the cheap ones.
    source TEXT NOT NULL DEFAULT 'template',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
