-- Restore the original generic placeholder titles.
UPDATE planet_lessons SET title = 'Learn',    description = 'New words and phrases' WHERE kind = 'learn';
UPDATE planet_lessons SET title = 'Practice', description = 'Repeat and practice'   WHERE kind = 'practice';
UPDATE planet_lessons SET title = 'Test',     description = 'Test your memory'      WHERE kind = 'test';
UPDATE planet_lessons SET title = 'Master',   description = 'Use in conversation'   WHERE kind = 'master';
