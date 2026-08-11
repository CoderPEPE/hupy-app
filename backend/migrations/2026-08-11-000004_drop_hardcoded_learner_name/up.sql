-- ---------------------------------------------------------------------------
-- Remove the hardcoded learner name "Sergio" from seeded content.
--
-- The app addressed every user as Sergio: the Realtime system prompt named
-- him (fixed in src/realtime.rs, which now substitutes the signed-in user's
-- own name), and the seeded course content did too.
--
-- Two kinds of content are affected:
--   1. lesson_steps.tutor_text — every scripted tutor line opened with
--      "Sergio, ...". Drop the vocative and capitalize what follows.
--   2. A Mercury target sentence literally asserting "My name is Sergio",
--      which the learner would be asked to repeat about themselves.
-- ---------------------------------------------------------------------------

-- 1. Drop the "Sergio, " vocative and re-capitalize the sentence.
--    The text after the comma was lower-case, and may begin with a quote
--    ('"bom dia" em inglês…') or a word ('para dar opinião: …'), so upper-case
--    the first letter wherever it falls.
UPDATE lesson_steps AS l
SET tutor_text = overlay(
        stripped placing upper(substring(stripped from letter_pos for 1)) from letter_pos for 1
    )
FROM (
    SELECT
        id,
        regexp_replace(tutor_text, '^Sergio,\s*', '') AS stripped,
        CASE WHEN regexp_replace(tutor_text, '^Sergio,\s*', '') LIKE '"%' THEN 2 ELSE 1 END AS letter_pos
    FROM lesson_steps
    WHERE tutor_text LIKE 'Sergio,%'
) AS src
WHERE l.id = src.id;

-- 2. Replace the identity-asserting sentence. Mercury position 7 already asks
--    "What is your name?", so this slot teaches another First Contacts phrase
--    instead of putting a stranger's name in the learner's mouth.
UPDATE planet_sentences
SET en = 'I am from Brazil',
    pt = 'Eu sou do Brasil',
    subject = 'I',
    verb = 'am',
    complement = 'from Brazil'
WHERE planet_id = '11111111-1111-4111-8111-111111111111'
  AND position = 8
  AND en = 'My name is Sergio';
