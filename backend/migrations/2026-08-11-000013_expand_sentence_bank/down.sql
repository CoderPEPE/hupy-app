-- Revert the sentence-bank expansion: drop every sentence this migration
-- added. The new rows are exactly those at positions >= the old per-planet
-- maximum (Planet 1 kept positions 1-10, Planets 2-3 kept 1-6, Planets 4-8
-- kept 1-6), and every one of the six courses added the same position ranges
-- — so one DELETE per planet number covers all courses.

DELETE FROM planet_sentences
WHERE (position >= 11 AND planet_id IN (SELECT id FROM planets WHERE number = 1))
   OR (position >= 7  AND planet_id IN (SELECT id FROM planets WHERE number IN (2, 3)))
   OR (position >= 7  AND planet_id IN (SELECT id FROM planets WHERE number >= 4));
