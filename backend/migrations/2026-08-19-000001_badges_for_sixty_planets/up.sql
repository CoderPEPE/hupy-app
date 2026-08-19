-- The badge ladder was calibrated for the retired 8-planet / 4-lesson course
-- (see 2026-08-11-000010_achievements). The curriculum is now 60 planets of
-- 10 modules each per course, so the top "planets" badge fired at 8 of 60 —
-- while claiming to be the whole solar system — and the lesson ladder topped
-- out a fraction of the way in.
--
-- Two fixes, both data:
--   1. Correct the descriptions that state a total which is no longer true.
--   2. Extend both ladders to the real end of the course.

-- 1. `planets_8` is no longer "every planet"; it is simply the eighth.
UPDATE badges
   SET title = 'Eight Worlds', description = 'Complete 8 planets'
 WHERE code = 'planets_8';

-- 2. Extend the ladders. `ON CONFLICT DO NOTHING` keeps this re-runnable and
--    keeps any code that already exists untouched.
INSERT INTO badges (code, title, description, icon, metric, threshold, scope, category, tier, xp_reward, sort_order) VALUES
-- ---------------------------------------------------------------- planets --
('planets_10', 'Double Digits',   'Complete 10 planets',                 'globe',  'planets_completed', 10, NULL, 'planets', 'gold',     50,  2100),
('planets_15', 'Fifteen Worlds',  'Complete 15 planets',                 'globe',  'planets_completed', 15, NULL, 'planets', 'gold',     50,  2150),
('planets_20', 'A Third of the Way', 'Complete 20 planets',              'rocket', 'planets_completed', 20, NULL, 'planets', 'gold',     50,  2200),
('planets_30', 'Halfway to C1',   'Complete 30 planets',                 'rocket', 'planets_completed', 30, NULL, 'planets', 'platinum', 100, 2300),
('planets_40', 'Forty Worlds',    'Complete 40 planets',                 'crown',  'planets_completed', 40, NULL, 'planets', 'platinum', 100, 2400),
('planets_50', 'The Far Reaches', 'Complete 50 planets',                 'crown',  'planets_completed', 50, NULL, 'planets', 'platinum', 100, 2500),
('planets_60', 'Whole System',    'Complete every planet in the system', 'crown',  'planets_completed', 60, NULL, 'planets', 'platinum', 200, 2600),
-- ---------------------------------------------------------------- lessons --
-- 10 modules x 60 planets = 600 across a full course.
('lessons_50',  'Fifty Modules',  'Finish 50 modules',                   'book-open', 'lessons_completed', 50,  NULL, 'lessons', 'gold',     50,  1500),
('lessons_100', 'One Hundred',    'Finish 100 modules',                  'book-open', 'lessons_completed', 100, NULL, 'lessons', 'gold',     50,  1600),
('lessons_200', 'Two Hundred',    'Finish 200 modules',                  'book-open', 'lessons_completed', 200, NULL, 'lessons', 'platinum', 100, 1700),
('lessons_300', 'Three Hundred',  'Finish 300 modules',                  'book-open', 'lessons_completed', 300, NULL, 'lessons', 'platinum', 100, 1800),
('lessons_450', 'Four Fifty',     'Finish 450 modules',                  'crown',     'lessons_completed', 450, NULL, 'lessons', 'platinum', 100, 1850),
('lessons_600', 'Every Module',   'Finish every module in the course',   'crown',     'lessons_completed', 600, NULL, 'lessons', 'platinum', 200, 1900)
ON CONFLICT (code) DO NOTHING;
