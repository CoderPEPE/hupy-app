DROP INDEX flashcards_lesson_idx;
ALTER TABLE flashcards DROP COLUMN lesson_id;
DROP TABLE user_module_progress;
ALTER TABLE planet_lessons DROP COLUMN focus, DROP COLUMN structures;
ALTER TABLE planets DROP COLUMN focus_verbs;
