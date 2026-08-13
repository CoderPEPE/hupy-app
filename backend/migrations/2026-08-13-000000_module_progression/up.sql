-- ---------------------------------------------------------------------------
-- The module state machine (the spec's core learning cycle).
--
-- A planet is ten modules, and a module is finished only when the learner has
-- BOTH held the conversation and cleared that module's flashcards:
--
--   conversation -> module flashcards -> next module unlocks
--   all ten modules -> planet complete -> audio story unlocks
--
-- Until now "module 4 is done" was derived from the planet's mastery average,
-- so nothing actually gated anything and the tutor was free to teach the whole
-- planet at once. These columns make the curriculum explicit (which verbs a
-- planet drills, which chunks a module owns) and record real per-module state.
-- ---------------------------------------------------------------------------

-- The three high-frequency verbs a planet is built around, e.g. ["have","need","can"].
ALTER TABLE planets ADD COLUMN focus_verbs JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE planet_lessons
    -- What this module drills: 'verb:have' | 'mix' | 'past' | 'future' |
    -- 'questions' | 'negation' | 'dialogue' | 'review'.
    ADD COLUMN focus TEXT NOT NULL DEFAULT '',
    -- The chunks the tutor may teach here: [{"target": "...", "base": "..."}].
    -- The tutor is held to these; anything else is off-curriculum for now.
    ADD COLUMN structures JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE user_module_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES planet_lessons(id) ON DELETE CASCADE,
    -- Set by the tutor's `complete_module` tool call, once the learner has
    -- produced every target structure correctly enough times.
    conversation_done BOOLEAN NOT NULL DEFAULT FALSE,
    -- Set when every flashcard this module generated has been reviewed.
    flashcards_done BOOLEAN NOT NULL DEFAULT FALSE,
    -- Structures the learner kept getting wrong, so later modules (and the
    -- next conversation's prompt) can bring them back.
    weak_structures JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
);

-- Flashcards belong to the module whose conversation produced them, so a
-- module can hand the learner its own set instead of a shared pile.
ALTER TABLE flashcards ADD COLUMN lesson_id UUID REFERENCES planet_lessons(id) ON DELETE SET NULL;
CREATE INDEX flashcards_lesson_idx ON flashcards (lesson_id);
