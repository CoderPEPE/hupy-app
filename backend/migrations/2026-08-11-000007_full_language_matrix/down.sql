-- Revert the full language matrix: remove the three new course sets
-- (ES→EN, EN→ES, ES→PT), drop the base_language columns, and restore the
-- per-target unique constraint that existed before.

-- 1. Content of the new courses (sentence/lesson/step rows reference planets,
--    which we delete last; the deletes are explicit to stay order-safe).
--    The new pairs are exactly base='es' (ES→EN, ES→PT) plus the EN→ES pair
--    (base='en' AND target='es') — the pre-existing PT course keeps its rows.
DELETE FROM lesson_steps WHERE planet_id IN (
    SELECT id FROM planets WHERE base_language = 'es' OR (base_language = 'en' AND language = 'es')
);
DELETE FROM planet_lessons WHERE planet_id IN (
    SELECT id FROM planets WHERE base_language = 'es' OR (base_language = 'en' AND language = 'es')
);
DELETE FROM planet_sentences WHERE planet_id IN (
    SELECT id FROM planets WHERE base_language = 'es' OR (base_language = 'en' AND language = 'es')
);
DELETE FROM planets WHERE base_language = 'es' OR (base_language = 'en' AND language = 'es');

-- 2. Restore the old constraint (unique per target language + number).
ALTER TABLE planets DROP CONSTRAINT planets_base_language_language_number_key;
ALTER TABLE planets ADD CONSTRAINT planets_language_number_key UNIQUE (language, number);

-- 3. Drop the base-language columns (all remaining rows default to 'pt',
--    matching the pre-migration state).
ALTER TABLE users DROP COLUMN base_language;
ALTER TABLE planets DROP COLUMN base_language;
