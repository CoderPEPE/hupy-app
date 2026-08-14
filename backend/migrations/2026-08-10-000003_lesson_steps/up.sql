-- Scripted pedagogical lessons, one per planet. Each step is a tutor turn
-- that follows the hupy cycle: teach -> repeat -> question -> correction ->
-- review -> praise. Corrections embed the "you said / correct form" pair so
-- the app can persist them into a conversation and turn them into flashcards.

CREATE TABLE lesson_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    position INT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('teach', 'repeat', 'question', 'review', 'praise', 'correction')),
    tutor_text TEXT NOT NULL,
    expected_text TEXT,
    mastery_gain DOUBLE PRECISION,
    -- Correction fields (only meaningful for kind = 'correction')
    correction_said TEXT,
    correction_corrected TEXT,
    correction_explanation TEXT,
    correction_pt TEXT,
    correction_mistake_part TEXT,
    correction_subject TEXT,
    correction_verb TEXT,
    correction_complement TEXT,
    UNIQUE (planet_id, position)
);

CREATE INDEX lesson_steps_planet_idx ON lesson_steps (planet_id, position);

-- ---------------------------------------------------------------------------
-- Seed: Planet 1 — First Contacts (greetings / introductions / how are you)
-- ---------------------------------------------------------------------------
INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
('11111111-1111-4111-8111-111111111111', 1, 'teach',
 'Sergio, "bom dia" em inglês é "good morning". Listen: good morning. Now repeat.',
 'good morning', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 2, 'repeat',
 'Very good! Let''s say it again, with a more natural rhythm.',
 'good morning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Once more, nice and clear.',
 'good morning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 4, 'teach',
 '"Boa tarde" é "good afternoon". Listen carefully: good afternoon. Now it''s your turn.',
 'good afternoon', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfect. One more time, please.',
 'good afternoon', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 6, 'question',
 'Now, how do you say "eu vim consertar a mesa"? Try it.',
 'I came to fix the table', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 7, 'correction',
 'Almost! The past of "come" is "came". Listen: I came to fix the table. Now you try.',
 'I came to fix the table', NULL,
 'I come to fix the table',
 'I came to fix the table',
 'Para dizer "eu vim", usamos o passado de "come", que é "came". "I come" é presente (eu venho); "I came" é passado (eu vim).',
 'Eu vim consertar a mesa',
 'come', 'I', 'came', 'to fix the table'),

('11111111-1111-4111-8111-111111111111', 8, 'review',
 'Surprise check! How do you say "quarta-feira" em inglês?',
 'Wednesday', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 9, 'question',
 'And "boa tarde"? Answer me in English.',
 'good afternoon', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('11111111-1111-4111-8111-111111111111', 10, 'praise',
 'Excellent! You''re doing great. Let''s keep going — today we practice days of the week.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- Seed: Planet 2 — Routine & Actions (work / school / eating)
-- ---------------------------------------------------------------------------
INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
('22222222-2222-4222-8222-222222222222', 1, 'teach',
 'Sergio, "eu trabalho todos os dias" em inglês é "I work every day". Listen: I work every day. Now repeat.',
 'I work every day', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'I work every day', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 3, 'teach',
 'Para falar do passado: "eu trabalhei ontem" é "I worked yesterday". Listen: I worked yesterday. Now you try.',
 'I worked yesterday', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 4, 'question',
 'And the future? How do you say "eu vou trabalhar amanhã"?',
 'I will work tomorrow', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 5, 'question',
 'Now make it negative: "eu não trabalho aos domingos".',
 'I don''t work on Sundays', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 6, 'question',
 'How would you ask "você trabalha aqui?"',
 'Do you work here?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('22222222-2222-4222-8222-222222222222', 7, 'praise',
 'Excellent! You know routine verbs in present, past, future, negation and questions. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- Seed: Planet 3 — Work & Daily Life (help / problems / schedules)
-- ---------------------------------------------------------------------------
INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
('33333333-3333-4333-8333-333333333333', 1, 'teach',
 'Sergio, "eu preciso de ajuda" em inglês é "I need help". Listen: I need help. Now repeat.',
 'I need help', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('33333333-3333-4333-8333-333333333333', 2, 'repeat',
 'Very good! Once more, nice and clear.',
 'I need help', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('33333333-3333-4333-8333-333333333333', 3, 'teach',
 'Para pedir ajuda educadamente: "Can you help me, please?". Listen: Can you help me, please? Now it''s your turn.',
 'Can you help me, please?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('33333333-3333-4333-8333-333333333333', 4, 'question',
 'How do you say "há um problema com o meu computador"?',
 'There is a problem with my computer', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),

('33333333-3333-4333-8333-333333333333', 5, 'praise',
 'Great job! Asking for help and reporting problems — you''re building real daily-life English.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
