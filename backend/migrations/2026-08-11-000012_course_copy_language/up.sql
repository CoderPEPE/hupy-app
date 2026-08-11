-- Course copy must be in the learner's BASE language.
--
-- 2026-08-11-000007 set out to give "every learner material explained in a
-- language they actually speak", and its three new courses (es->en, en->es,
-- es->pt) do exactly that. The three courses that predate it kept the copy
-- they were cloned from, which was in the TARGET language:
--
--   course   planets.subtitle / topics / lesson titles   should be
--   -------  -----------------------------------------   ---------
--   en->pt   Portuguese                                   English
--   pt->en   English                                      Portuguese
--   pt->es   Spanish                                      Portuguese
--
-- So a Brazilian learning English — the app's original audience — read
-- English planet subtitles and lesson titles inside an otherwise Portuguese
-- UI, while their scripted lesson steps were already correctly Portuguese.
--
-- Nothing needs translating: every string already exists in the right
-- language on a sibling course (planet numbers and lesson positions are
-- identical across all six), so each fix is a copy. Both statements are
-- single UPDATE ... FROM, so the source side reads the pre-update snapshot —
-- en->pt can be a Portuguese source and an English target at once.

UPDATE planets p
SET subtitle = src.subtitle,
    topics   = src.topics
FROM planets src
WHERE src.number = p.number
  AND (
        -- needs English copy, take it from en->es
        (p.base_language = 'en' AND p.language = 'pt' AND src.base_language = 'en' AND src.language = 'es')
        -- needs Portuguese copy, take it from en->pt
     OR (p.base_language = 'pt' AND p.language = 'en' AND src.base_language = 'en' AND src.language = 'pt')
     OR (p.base_language = 'pt' AND p.language = 'es' AND src.base_language = 'en' AND src.language = 'pt')
      );

UPDATE planet_lessons pl
SET title       = src.title,
    description = src.description
FROM planet_lessons src
JOIN planets sp ON sp.id = src.planet_id
WHERE pl.position = src.position
  AND EXISTS (
        SELECT 1 FROM planets p
        WHERE p.id = pl.planet_id
          AND p.number = sp.number
          AND (
                (p.base_language = 'en' AND p.language = 'pt' AND sp.base_language = 'en' AND sp.language = 'es')
             OR (p.base_language = 'pt' AND p.language = 'en' AND sp.base_language = 'en' AND sp.language = 'pt')
             OR (p.base_language = 'pt' AND p.language = 'es' AND sp.base_language = 'en' AND sp.language = 'pt')
              )
      );

-- Planet names were the English proper nouns on every course. They are shown
-- as deck names, on the planet cards and in the chat pill, next to
-- achievements that already say "Estudioso de Mercúrio" — so localize them by
-- the learner's base language too.
UPDATE planets SET title = t.name
FROM (VALUES
    (1, 'en', 'Mercury'), (1, 'pt', 'Mercúrio'), (1, 'es', 'Mercurio'),
    (2, 'en', 'Venus'),   (2, 'pt', 'Vênus'),    (2, 'es', 'Venus'),
    (3, 'en', 'Earth'),   (3, 'pt', 'Terra'),    (3, 'es', 'Tierra'),
    (4, 'en', 'Mars'),    (4, 'pt', 'Marte'),    (4, 'es', 'Marte'),
    (5, 'en', 'Jupiter'), (5, 'pt', 'Júpiter'),  (5, 'es', 'Júpiter'),
    (6, 'en', 'Saturn'),  (6, 'pt', 'Saturno'),  (6, 'es', 'Saturno'),
    (7, 'en', 'Uranus'),  (7, 'pt', 'Urano'),    (7, 'es', 'Urano'),
    (8, 'en', 'Neptune'), (8, 'pt', 'Netuno'),   (8, 'es', 'Neptuno')
) AS t(number, base_language, name)
WHERE planets.number = t.number
  AND planets.base_language = t.base_language;
