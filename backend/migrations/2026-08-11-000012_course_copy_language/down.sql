-- Restores the pre-fix state: target-language copy on the three legacy
-- courses, and the English planet names everywhere.
UPDATE planets p
SET subtitle = src.subtitle,
    topics   = src.topics
FROM planets src
WHERE src.number = p.number
  AND (
        (p.base_language = 'en' AND p.language = 'pt' AND src.base_language = 'es' AND src.language = 'pt')
     OR (p.base_language = 'pt' AND p.language = 'en' AND src.base_language = 'en' AND src.language = 'es')
     OR (p.base_language = 'pt' AND p.language = 'es' AND src.base_language = 'es' AND src.language = 'en')
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
                (p.base_language = 'en' AND p.language = 'pt' AND sp.base_language = 'es' AND sp.language = 'pt')
             OR (p.base_language = 'pt' AND p.language = 'en' AND sp.base_language = 'en' AND sp.language = 'es')
             OR (p.base_language = 'pt' AND p.language = 'es' AND sp.base_language = 'es' AND sp.language = 'en')
              )
      );

UPDATE planets SET title = t.name
FROM (VALUES
    (1, 'Mercury'), (2, 'Venus'), (3, 'Earth'), (4, 'Mars'),
    (5, 'Jupiter'), (6, 'Saturn'), (7, 'Uranus'), (8, 'Neptune')
) AS t(number, name)
WHERE planets.number = t.number;
