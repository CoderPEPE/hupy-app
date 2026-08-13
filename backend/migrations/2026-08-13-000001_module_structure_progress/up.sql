-- ---------------------------------------------------------------------------
-- Per-structure drill progress inside a module conversation.
--
-- The tutor (Realtime model) is told to have the learner produce each
-- structure of the module three times before moving on, but nothing kept it
-- honest: with only its own conversational memory it looped over the same
-- sentences forever and never called complete_module, so a module never
-- closed. These counts are the checkpoint:
--
--   - the tutor calls record_production each time the learner produces the
--     current structure correctly;
--   - the count is persisted here, so closing the app mid-module resumes at
--     the exact same spot (the prompt is rebuilt from these rows);
--   - once every structure reaches the module's required productions, the
--     conversation closes automatically — no reliance on the model.
-- ---------------------------------------------------------------------------

CREATE TABLE module_structure_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES planet_lessons(id) ON DELETE CASCADE,
    -- The structure's target-language sentence, exactly as authored in the
    -- module's `structures` column. It is the natural key: stable across
    -- sessions, human-readable in logs, and never renumbered by curriculum
    -- edits the way a positional index would be.
    structure_key TEXT NOT NULL,
    -- Successful productions so far, capped at the module's requirement (3).
    productions INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id, structure_key)
);

-- The module gate queries "how many structures are done" per learner+lesson;
-- the composite PK already serves it, but a (user, lesson) index keeps the
-- planet-detail lookup (all modules of one planet at once) cheap.
CREATE INDEX module_structure_progress_user_lesson_idx
    ON module_structure_progress (user_id, lesson_id);
