-- ---------------------------------------------------------------------------
-- Full language matrix — every base→target pair of English/Spanish/Portuguese.
--
-- Before this migration a course was identified by its TARGET language only
-- ('en' → base pt, 'es' → base pt, 'pt' → base en). That leaves three of the
-- six possible pairs uncovered: ES→EN, EN→ES and ES→PT. A course is now the
-- ordered pair (base_language, language), with its own duplicate planet set,
-- so every learner gets material explained in a language they actually speak.
--
--   (base, target)   content source
--   ---------------  ------------------------------------------------
--   (pt, en)         existing en course
--   (pt, es)         existing es course
--   (en, pt)         existing pt course
--   (es, en)         NEW: English targets (en course) + Spanish bases
--   (en, es)         NEW: Spanish targets (es course) + English bases
--   (es, pt)         NEW: Portuguese targets (pt course) + Spanish bases
--
-- Sentences are built by joining existing rows: every target sentence and its
-- translation already exist in one of the three language columns, so the new
-- courses reuse them (same planet number & position across courses). The
-- scripted lesson steps are authored by hand in each course's base language.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Schema: planets.base_language + users.base_language
-- ---------------------------------------------------------------------------

ALTER TABLE planets
    ADD COLUMN base_language VARCHAR(8) NOT NULL DEFAULT 'pt';

-- Backfill: the en/es courses explained from Portuguese, pt from English.
UPDATE planets SET base_language = CASE language WHEN 'pt' THEN 'en' ELSE 'pt' END;

-- `number` is now unique per (base, target) pair.
ALTER TABLE planets DROP CONSTRAINT planets_language_number_key;
ALTER TABLE planets
    ADD CONSTRAINT planets_base_language_language_number_key
    UNIQUE (base_language, language, number);

ALTER TABLE users
    ADD COLUMN base_language VARCHAR(8) NOT NULL DEFAULT 'pt';

UPDATE users SET base_language = CASE language WHEN 'pt' THEN 'en' ELSE 'pt' END;

-- ---------------------------------------------------------------------------
-- 2. Planets for the new pairs.
--    Subtitle/topics are written in the base language (what the learner
--    reads), so: es→en and es→pt copy the Spanish-course planets; en→es
--    copies the English-course planets. Colors/unlock thresholds are kept.
-- ---------------------------------------------------------------------------

-- es→en (teach English to Spanish speakers): base 'es', target 'en'
INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery, language, base_language)
SELECT ('a' || substr(id::text, 2))::uuid, number, title, subtitle, color, topics, unlock_mastery, 'en', 'es'
FROM planets WHERE language = 'es' AND base_language = 'pt';

-- en→es (teach Spanish to English speakers): base 'en', target 'es'
INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery, language, base_language)
SELECT ('b' || substr(id::text, 2))::uuid, number, title, subtitle, color, topics, unlock_mastery, 'es', 'en'
FROM planets WHERE language = 'en' AND base_language = 'pt';

-- es→pt (teach Portuguese to Spanish speakers): base 'es', target 'pt'
INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery, language, base_language)
SELECT ('c' || substr(id::text, 2))::uuid, number, title, subtitle, color, topics, unlock_mastery, 'pt', 'es'
FROM planets WHERE language = 'es' AND base_language = 'pt';

-- ---------------------------------------------------------------------------
-- 3. Sentences for the new pairs — built from existing (number, position)
--    aligned rows. The target text and its base translation already exist in
--    the three language columns across courses; structure fields describe the
--    TARGET sentence and come from the course that already taught it.
--    The unused slot stays ''.
-- ---------------------------------------------------------------------------

-- es→en: en = English target (en course), es = Spanish base (es course)
INSERT INTO planet_sentences (planet_id, position, en, es, pt, subject, verb, complement)
SELECT np.id, src.position, src.en, ses.es, '', src.subject, src.verb, src.complement
FROM planet_sentences src
JOIN planets sp   ON sp.id = src.planet_id AND sp.language = 'en' AND sp.base_language = 'pt'
JOIN planets np   ON np.number = sp.number AND np.language = 'en' AND np.base_language = 'es'
JOIN planets esp  ON esp.number = sp.number AND esp.language = 'es' AND esp.base_language = 'pt'
JOIN planet_sentences ses ON ses.planet_id = esp.id AND ses.position = src.position
ORDER BY np.number, src.position;

-- en→es: es = Spanish target (es course), en = English base (en course)
INSERT INTO planet_sentences (planet_id, position, en, es, pt, subject, verb, complement)
SELECT np.id, src.position, eng2.en, src.es, '', src.subject, src.verb, src.complement
FROM planet_sentences src
JOIN planets sp   ON sp.id = src.planet_id AND sp.language = 'es' AND sp.base_language = 'pt'
JOIN planets np   ON np.number = sp.number AND np.language = 'es' AND np.base_language = 'en'
JOIN planets eng  ON eng.number = sp.number AND eng.language = 'en' AND eng.base_language = 'pt'
JOIN planet_sentences eng2 ON eng2.planet_id = eng.id AND eng2.position = src.position
ORDER BY np.number, src.position;

-- es→pt: pt = Portuguese target (pt course), es = Spanish base (es course)
INSERT INTO planet_sentences (planet_id, position, en, es, pt, subject, verb, complement)
SELECT np.id, src.position, '', ses.es, src.pt, src.subject, src.verb, src.complement
FROM planet_sentences src
JOIN planets sp   ON sp.id = src.planet_id AND sp.language = 'pt' AND sp.base_language = 'en'
JOIN planets np   ON np.number = sp.number AND np.language = 'pt' AND np.base_language = 'es'
JOIN planets esp  ON esp.number = sp.number AND esp.language = 'es' AND esp.base_language = 'pt'
JOIN planet_sentences ses ON ses.planet_id = esp.id AND ses.position = src.position
ORDER BY np.number, src.position;

-- ---------------------------------------------------------------------------
-- 4. Lessons for the new pairs — titles/descriptions are written in the base
--    language, so they are copied from the matching existing course.
-- ---------------------------------------------------------------------------

-- es→en: Spanish lesson titles (es course)
INSERT INTO planet_lessons (planet_id, position, kind, title, description)
SELECT np.id, pl.position, pl.kind, pl.title, pl.description
FROM planet_lessons pl
JOIN planets sp ON sp.id = pl.planet_id AND sp.language = 'es' AND sp.base_language = 'pt'
JOIN planets np ON np.number = sp.number AND np.language = 'en' AND np.base_language = 'es'
ORDER BY np.number, pl.position;

-- en→es: English lesson titles (en course)
INSERT INTO planet_lessons (planet_id, position, kind, title, description)
SELECT np.id, pl.position, pl.kind, pl.title, pl.description
FROM planet_lessons pl
JOIN planets sp ON sp.id = pl.planet_id AND sp.language = 'en' AND sp.base_language = 'pt'
JOIN planets np ON np.number = sp.number AND np.language = 'es' AND np.base_language = 'en'
ORDER BY np.number, pl.position;

-- es→pt: Spanish lesson titles (es course)
INSERT INTO planet_lessons (planet_id, position, kind, title, description)
SELECT np.id, pl.position, pl.kind, pl.title, pl.description
FROM planet_lessons pl
JOIN planets sp ON sp.id = pl.planet_id AND sp.language = 'es' AND sp.base_language = 'pt'
JOIN planets np ON np.number = sp.number AND np.language = 'pt' AND np.base_language = 'es'
ORDER BY np.number, pl.position;

-- ---------------------------------------------------------------------------
-- 5. es→en — scripted demo lessons. The tutor teaches English in Spanish.
--    Same four-stage arc and step layout as the existing courses.
-- ---------------------------------------------------------------------------

INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mercurio (Primeros Contactos)
('a1111111-1111-4111-8111-111111111111', 1, 'teach',
 '"buenos días" en inglés es "good morning". Escucha: good morning. Ahora repite.',
 'good morning', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 2, 'repeat',
 '¡Muy bien! Vamos a decirlo otra vez, con un ritmo más natural.',
 'good morning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Una vez más, con calma y claridad.',
 'good morning', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 4, 'teach',
 '"buenas tardes" en inglés es "good afternoon". Escucha con atención: good afternoon. Ahora te toca a ti.',
 'good afternoon', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfecto. Una vez más, por favor.',
 'good afternoon', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 6, 'question',
 'Ahora, ¿cómo se dice "vine a arreglar la mesa" en inglés? Inténtalo.',
 'I came to fix the table', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 7, 'correction',
 '¡Casi! El pasado de "come" es "came". Escucha: I came to fix the table. Ahora inténtalo de nuevo.',
 'I came to fix the table', NULL,
 'I come to fix the table',
 'I came to fix the table',
 'Para decir "vine", usamos el pasado de "come", que es "came". "I come" es el presente; "came" es el pasado.',
 'Vine a arreglar la mesa',
 'come', 'I', 'came', 'to fix the table'),
('a1111111-1111-4111-8111-111111111111', 8, 'review',
 '¡Pregunta sorpresa! ¿Cómo se dice "miércoles" en inglés?',
 'Wednesday', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 9, 'question',
 '¿Y "buenas tardes"? Respóndeme en inglés.',
 'good afternoon', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a1111111-1111-4111-8111-111111111111', 10, 'praise',
 '¡Excelente! Lo estás haciendo muy bien. Vamos a seguir — hoy practicamos los días de la semana.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Venus (Rutina y Acciones)
('a2222222-2222-4222-8222-222222222222', 1, 'teach',
 '"trabajo todos los días" en inglés es "I work every day". Escucha: I work every day. Ahora repite.',
 'I work every day', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'I work every day', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 3, 'teach',
 'Para hablar del pasado: "trabajé ayer" en inglés es "I worked yesterday". Escucha: I worked yesterday. Ahora tú.',
 'I worked yesterday', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 4, 'question',
 '¿Y el futuro? ¿Cómo se dice "trabajaré mañana" en inglés?',
 'I will work tomorrow', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 5, 'question',
 'Ahora en negativo: "no trabajo los domingos".',
 'I don''t work on Sundays', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 6, 'question',
 '¿Cómo preguntarías "¿trabajas aquí?" en inglés?',
 'Do you work here?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a2222222-2222-4222-8222-222222222222', 7, 'praise',
 '¡Excelente! Conoces los verbos de rutina en presente, pasado, futuro, negativo e interrogativo. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Tierra (Trabajo y Vida Diaria)
('a3333333-3333-4333-8333-333333333333', 1, 'teach',
 '"necesito ayuda" en inglés es "I need help". Escucha: I need help. Ahora repite.',
 'I need help', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a3333333-3333-4333-8333-333333333333', 2, 'repeat',
 '¡Muy bien! Una vez más, con calma y claridad.',
 'I need help', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a3333333-3333-4333-8333-333333333333', 3, 'teach',
 'Para pedir ayuda con educación: "¿Puedes ayudarme, por favor?" en inglés es "Can you help me, please?". Escucha: Can you help me, please? Ahora te toca.',
 'Can you help me, please?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a3333333-3333-4333-8333-333333333333', 4, 'question',
 '¿Cómo se dice "hay un problema con mi computadora" en inglés?',
 'There is a problem with my computer', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a3333333-3333-4333-8333-333333333333', 5, 'praise',
 '¡Buen trabajo! Pedir ayuda y reportar problemas — estás construyendo inglés real para el día a día.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Marte (Comida y Alimentación)
('a4444444-4444-4444-8444-444444444444', 1, 'teach',
 '"me gustaría pedir una pizza" en inglés es "I would like to order a pizza, please". Escucha: I would like to order a pizza, please. Ahora repite.',
 'I would like to order a pizza, please.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a4444444-4444-4444-8444-444444444444', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'I would like to order a pizza, please.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a4444444-4444-4444-8444-444444444444', 3, 'teach',
 'Para negar: "no como carne" en inglés es "I don''t eat meat". Escucha: I don''t eat meat. Ahora tú.',
 'I don''t eat meat.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a4444444-4444-4444-8444-444444444444', 4, 'question',
 '¿Cómo se dice "tengo sed" en inglés?',
 'I''m thirsty.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a4444444-4444-4444-8444-444444444444', 5, 'praise',
 '¡Excelente! Sabes pedir comida y hablar de alimentación. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Júpiter (Viajes y Desplazamientos)
('a5555555-5555-4555-8555-555555555555', 1, 'teach',
 'Para pedir información: "Disculpe, ¿dónde está la estación de tren?" en inglés es "Excuse me, where is the train station?". Escucha: Excuse me, where is the train station? Ahora repite.',
 'Excuse me, where is the train station?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a5555555-5555-4555-8555-555555555555', 2, 'repeat',
 '¡Muy bien! Una vez más, con calma y claridad.',
 'Excuse me, where is the train station?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a5555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Necesito reservar una habitación de hotel" en inglés es "I need to book a hotel room". Escucha: I need to book a hotel room. Ahora te toca.',
 'I need to book a hotel room.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a5555555-5555-4555-8555-555555555555', 4, 'question',
 '¿Cómo se dice "gira a la izquierda en el semáforo" en inglés?',
 'Turn left at the traffic light.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a5555555-5555-4555-8555-555555555555', 5, 'praise',
 '¡Buen trabajo! Ya puedes orientarte. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturno (Salud y Emociones)
('a6666666-6666-4666-8666-666666666666', 1, 'teach',
 '"hoy no me siento bien" en inglés es "I don''t feel well today". Escucha: I don''t feel well today. Ahora repite.',
 'I don''t feel well today.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a6666666-6666-4666-8666-666666666666', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'I don''t feel well today.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a6666666-6666-4666-8666-666666666666', 3, 'teach',
 'Para dar consejos: "deberías ver a un médico" en inglés es "You should see a doctor". Escucha: You should see a doctor.',
 'You should see a doctor.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a6666666-6666-4666-8666-666666666666', 4, 'question',
 '¿Cómo preguntas "¿te sientes mejor ahora?" en inglés?',
 'Are you feeling better now?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a6666666-6666-4666-8666-666666666666', 5, 'praise',
 '¡Excelente! Sabes hablar de salud y sentimientos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Urano (Trabajo y Negocios)
('a7777777-7777-4777-8777-777777777777', 1, 'teach',
 'En el trabajo: "¿Podemos agendar una reunión para el lunes?" en inglés es "Can we schedule a meeting for Monday?". Escucha: Can we schedule a meeting for Monday? Ahora repite.',
 'Can we schedule a meeting for Monday?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a7777777-7777-4777-8777-777777777777', 2, 'repeat',
 '¡Muy bien! Una vez más, por favor.',
 'Can we schedule a meeting for Monday?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a7777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Te enviaré el informe por correo electrónico" en inglés es "I will send you the report by email". Escucha: I will send you the report by email.',
 'I will send you the report by email.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a7777777-7777-4777-8777-777777777777', 4, 'question',
 '¿Cómo se dice "necesitamos terminar el proyecto para el viernes" en inglés?',
 'We need to finish the project by Friday.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a7777777-7777-4777-8777-777777777777', 5, 'praise',
 '¡Buen trabajo! Estás construyendo inglés profesional de verdad.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptuno (Conversaciones Avanzadas)
('a8888888-8888-4888-8888-888888888888', 1, 'teach',
 'Para dar una opinión: "en mi opinión, esta es una gran idea" en inglés es "In my opinion, this is a great idea". Escucha: In my opinion, this is a great idea. Ahora repite.',
 'In my opinion, this is a great idea.', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a8888888-8888-4888-8888-888888888888', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'In my opinion, this is a great idea.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a8888888-8888-4888-8888-888888888888', 3, 'teach',
 'Una expresión útil: "¡es pan comido!" en inglés es "It''s a piece of cake!". Escucha: It''s a piece of cake!.',
 'It''s a piece of cake!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a8888888-8888-4888-8888-888888888888', 4, 'question',
 '¿Cómo se dice "no puedo esperar para verte" en inglés?',
 'I can''t wait to see you.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('a8888888-8888-4888-8888-888888888888', 5, 'praise',
 '¡Increíble! Estás hablando con naturalidad y confianza.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- 6. en→es — scripted demo lessons. The tutor teaches Spanish in English.
-- ---------------------------------------------------------------------------

INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mercury (First Contacts)
('b1111111-1111-4111-8111-111111111111', 1, 'teach',
 '"Buenos días" means "good morning" — say: buenos días. Listen: buenos días. Now repeat.',
 'buenos días', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 2, 'repeat',
 'Very good! Let''s say it again, with a more natural rhythm.',
 'buenos días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Once more, nice and clear.',
 'buenos días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 4, 'teach',
 '"Buenas tardes" means "good afternoon" — say: buenas tardes. Listen carefully: buenas tardes. Now it''s your turn.',
 'buenas tardes', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfect. One more time, please.',
 'buenas tardes', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 6, 'question',
 'Now, how do you say "I came to fix the table" in Spanish? Try it.',
 'Vine a arreglar la mesa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 7, 'correction',
 'Almost! To say "vine" we use the past of "venir", which is "vine". Listen: vine a arreglar la mesa. Now you try.',
 'Vine a arreglar la mesa', NULL,
 'Yo venir a arreglar la mesa',
 'Vine a arreglar la mesa',
 'To say "I came", we use the past tense of "venir", which is "vine". "Yo venir" is the infinitive; "vine" is the past.',
 'I came to fix the table',
 'venir', 'yo', 'vine', 'a arreglar la mesa'),
('b1111111-1111-4111-8111-111111111111', 8, 'review',
 'Surprise check! How do you say "Wednesday" in Spanish?',
 'miércoles', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 9, 'question',
 'And "buenas tardes"? Answer me in Spanish.',
 'buenas tardes', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b1111111-1111-4111-8111-111111111111', 10, 'praise',
 'Excellent! You''re doing great. Let''s keep going — today we practice the days of the week.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Venus (Routine & Actions)
('b2222222-2222-4222-8222-222222222222', 1, 'teach',
 '"Trabajo todos los días" means "I work every day" — say: trabajo todos los días. Listen: trabajo todos los días. Now repeat.',
 'trabajo todos los días', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'trabajo todos los días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 3, 'teach',
 'To talk about the past: "trabajé ayer" means "I worked yesterday" — say: trabajé ayer. Listen: trabajé ayer. Now you try.',
 'trabajé ayer', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 4, 'question',
 'And the future? How do you say "I will work tomorrow" in Spanish?',
 'trabajaré mañana', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 5, 'question',
 'Now make it negative: "I don''t work on Sundays".',
 'no trabajo los domingos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 6, 'question',
 'How would you ask "do you work here?" in Spanish?',
 '¿Trabajas aquí?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b2222222-2222-4222-8222-222222222222', 7, 'praise',
 'Excellent! You know routine verbs in the present, past, future, negative and question forms. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Earth (Work & Daily Life)
('b3333333-3333-4333-8333-333333333333', 1, 'teach',
 '"Necesito ayuda" means "I need help" — say: necesito ayuda. Listen: necesito ayuda. Now repeat.',
 'necesito ayuda', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b3333333-3333-4333-8333-333333333333', 2, 'repeat',
 'Very good! Once more, nice and clear.',
 'necesito ayuda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b3333333-3333-4333-8333-333333333333', 3, 'teach',
 'To ask for help politely: "¿Puedes ayudarme, por favor?". Listen: ¿Puedes ayudarme, por favor? Now it''s your turn.',
 '¿Puedes ayudarme, por favor?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b3333333-3333-4333-8333-333333333333', 4, 'question',
 'How do you say "there is a problem with my computer" in Spanish?',
 'Hay un problema con mi computadora', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b3333333-3333-4333-8333-333333333333', 5, 'praise',
 'Great job! Asking for help and reporting problems — you''re building real daily-life Spanish.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Mars (Food & Eating)
('b4444444-4444-4444-8444-444444444444', 1, 'teach',
 '"Me gustaría pedir una pizza" means "I would like to order a pizza" — say: me gustaría pedir una pizza, por favor. Listen: me gustaría pedir una pizza, por favor. Now repeat.',
 'me gustaría pedir una pizza, por favor', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b4444444-4444-4444-8444-444444444444', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'me gustaría pedir una pizza, por favor', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b4444444-4444-4444-8444-444444444444', 3, 'teach',
 'To negate: "no como carne" means "I don''t eat meat" — say: no como carne. Listen: no como carne. Now you try.',
 'no como carne', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b4444444-4444-4444-8444-444444444444', 4, 'question',
 'How do you say "I''m thirsty" in Spanish?',
 'tengo sed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b4444444-4444-4444-8444-444444444444', 5, 'praise',
 'Excellent! You can order food and talk about eating. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Jupiter (Travel & Getting Around)
('b5555555-5555-4555-8555-555555555555', 1, 'teach',
 'To ask for information: "Disculpe, ¿dónde está la estación de tren?" means "excuse me, where is the train station?" — say: Disculpe, ¿dónde está la estación de tren? Listen: Disculpe, ¿dónde está la estación de tren? Now repeat.',
 'Disculpe, ¿dónde está la estación de tren?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b5555555-5555-4555-8555-555555555555', 2, 'repeat',
 'Very good! One more time, nice and clear.',
 'Disculpe, ¿dónde está la estación de tren?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b5555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Necesito reservar una habitación de hotel" means "I need to book a hotel room" — say: necesito reservar una habitación de hotel. Listen: necesito reservar una habitación de hotel. Now it''s your turn.',
 'necesito reservar una habitación de hotel', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b5555555-5555-4555-8555-555555555555', 4, 'question',
 'How do you say "turn left at the traffic light" in Spanish?',
 'Gira a la izquierda en el semáforo', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b5555555-5555-4555-8555-555555555555', 5, 'praise',
 'Great job! You can find your way around. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturn (Health & Emotions)
('b6666666-6666-4666-8666-666666666666', 1, 'teach',
 '"Hoy no me siento bien" means "I don''t feel well today" — say: hoy no me siento bien. Listen: hoy no me siento bien. Now repeat.',
 'hoy no me siento bien', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b6666666-6666-4666-8666-666666666666', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'hoy no me siento bien', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b6666666-6666-4666-8666-666666666666', 3, 'teach',
 'To give advice: "deberías ver a un médico" means "you should see a doctor" — say: deberías ver a un médico. Listen: deberías ver a un médico.',
 'deberías ver a un médico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b6666666-6666-4666-8666-666666666666', 4, 'question',
 'How do you ask "are you feeling better now?" in Spanish?',
 '¿Te sientes mejor ahora?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b6666666-6666-4666-8666-666666666666', 5, 'praise',
 'Excellent! You can talk about health and feelings.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Uranus (Work & Business)
('b7777777-7777-4777-8777-777777777777', 1, 'teach',
 'At work: "¿Podemos agendar una reunión para el lunes?" means "can we schedule a meeting for Monday?" — say: ¿Podemos agendar una reunión para el lunes? Listen: ¿Podemos agendar una reunión para el lunes? Now repeat.',
 '¿Podemos agendar una reunión para el lunes?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b7777777-7777-4777-8777-777777777777', 2, 'repeat',
 'Very good! One more time, please.',
 '¿Podemos agendar una reunión para el lunes?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b7777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Te enviaré el informe por correo electrónico" means "I will send you the report by email" — say: te enviaré el informe por correo electrónico. Listen: te enviaré el informe por correo electrónico.',
 'te enviaré el informe por correo electrónico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b7777777-7777-4777-8777-777777777777', 4, 'question',
 'How do you say "we need to finish the project by Friday" in Spanish?',
 'Necesitamos terminar el proyecto para el viernes', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b7777777-7777-4777-8777-777777777777', 5, 'praise',
 'Great job! You are building real professional Spanish.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptune (Advanced Conversations)
('b8888888-8888-4888-8888-888888888888', 1, 'teach',
 'To give an opinion: "en mi opinión, esta es una gran idea" means "in my opinion, this is a great idea" — say: en mi opinión, esta es una gran idea. Listen: en mi opinión, esta es una gran idea. Now repeat.',
 'en mi opinión, esta es una gran idea', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b8888888-8888-4888-8888-888888888888', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'en mi opinión, esta es una gran idea', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b8888888-8888-4888-8888-888888888888', 3, 'teach',
 'A useful expression: "¡es pan comido!" means "it''s a piece of cake!" — say: ¡es pan comido!. Listen: ¡es pan comido!.',
 '¡es pan comido!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b8888888-8888-4888-8888-888888888888', 4, 'question',
 'How do you say "I can''t wait to see you" in Spanish?',
 'No puedo esperar para verte', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('b8888888-8888-4888-8888-888888888888', 5, 'praise',
 'Outstanding! You are speaking naturally and with confidence.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- 7. es→pt — scripted demo lessons. The tutor teaches Portuguese in Spanish.
-- ---------------------------------------------------------------------------

INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mercurio (Primeros Contactos)
('c1111111-1111-4111-8111-111111111111', 1, 'teach',
 '"buenos días" en portugués es "bom dia". Escucha: bom dia. Ahora repite.',
 'bom dia', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 2, 'repeat',
 '¡Muy bien! Vamos a decirlo otra vez, con un ritmo más natural.',
 'bom dia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Una vez más, con calma y claridad.',
 'bom dia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 4, 'teach',
 '"Buenas tardes" en portugués es "boa tarde". Escucha con atención: boa tarde. Ahora te toca a ti.',
 'boa tarde', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfecto. Una vez más, por favor.',
 'boa tarde', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 6, 'question',
 'Ahora, ¿cómo se dice "vine a arreglar la mesa" en portugués? Inténtalo.',
 'Eu vim consertar a mesa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 7, 'correction',
 '¡Casi! El pasado de "vir" es "vim". Escucha: eu vim consertar a mesa. Ahora inténtalo de nuevo.',
 'Eu vim consertar a mesa', NULL,
 'Eu vem consertar a mesa',
 'Eu vim consertar a mesa',
 'Para decir "vim", usamos el pasado de "vir", que es "vim". "Eu vem" es la forma incorrecta; "vim" es el pasado.',
 'Vine a arreglar la mesa',
 'vem', 'eu', 'vim', 'consertar a mesa'),
('c1111111-1111-4111-8111-111111111111', 8, 'review',
 '¡Pregunta sorpresa! ¿Cómo se dice "miércoles" en portugués?',
 'quarta-feira', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 9, 'question',
 '¿Y "buenas tardes"? Respóndeme en portugués.',
 'boa tarde', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c1111111-1111-4111-8111-111111111111', 10, 'praise',
 '¡Excelente! Lo estás haciendo muy bien. Vamos a seguir — hoy practicamos los días de la semana.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Venus (Rutina y Acciones)
('c2222222-2222-4222-8222-222222222222', 1, 'teach',
 '"trabajo todos los días" en portugués es "eu trabalho todos os dias". Escucha: eu trabalho todos os dias. Ahora repite.',
 'eu trabalho todos os dias', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'eu trabalho todos os dias', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 3, 'teach',
 'Para hablar del pasado: "trabajé ayer" en portugués es "eu trabalhei ontem". Escucha: eu trabalhei ontem. Ahora tú.',
 'eu trabalhei ontem', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 4, 'question',
 '¿Y el futuro? ¿Cómo se dice "trabajaré mañana" en portugués?',
 'eu vou trabalhar amanhã', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 5, 'question',
 'Ahora en negativo: "no trabajo los domingos".',
 'eu não trabalho aos domingos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 6, 'question',
 '¿Cómo preguntarías "¿trabajas aquí?" en portugués?',
 'você trabalha aqui?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c2222222-2222-4222-8222-222222222222', 7, 'praise',
 '¡Excelente! Conoces los verbos de rutina en presente, pasado, futuro, negativo e interrogativo. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Tierra (Trabajo y Vida Diaria)
('c3333333-3333-4333-8333-333333333333', 1, 'teach',
 '"necesito ayuda" en portugués es "eu preciso de ajuda". Escucha: eu preciso de ajuda. Ahora repite.',
 'eu preciso de ajuda', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c3333333-3333-4333-8333-333333333333', 2, 'repeat',
 '¡Muy bien! Una vez más, con calma y claridad.',
 'eu preciso de ajuda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c3333333-3333-4333-8333-333333333333', 3, 'teach',
 'Para pedir ayuda con educación: "¿Puedes ayudarme, por favor?" en portugués es "você pode me ajudar, por favor?". Escucha: você pode me ajudar, por favor? Ahora te toca.',
 'você pode me ajudar, por favor?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c3333333-3333-4333-8333-333333333333', 4, 'question',
 '¿Cómo se dice "hay un problema con mi computadora" en portugués?',
 'há um problema com o meu computador', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c3333333-3333-4333-8333-333333333333', 5, 'praise',
 '¡Buen trabajo! Pedir ayuda y reportar problemas — estás construyendo portugués real para el día a día.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Marte (Comida y Alimentación)
('c4444444-4444-4444-8444-444444444444', 1, 'teach',
 '"me gustaría pedir una pizza" en portugués es "eu gostaria de pedir uma pizza, por favor". Escucha: eu gostaria de pedir uma pizza, por favor. Ahora repite.',
 'eu gostaria de pedir uma pizza, por favor', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c4444444-4444-4444-8444-444444444444', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'eu gostaria de pedir uma pizza, por favor', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c4444444-4444-4444-8444-444444444444', 3, 'teach',
 'Para negar: "no como carne" en portugués es "eu não como carne". Escucha: eu não como carne. Ahora tú.',
 'eu não como carne', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c4444444-4444-4444-8444-444444444444', 4, 'question',
 '¿Cómo se dice "tengo sed" en portugués?',
 'estou com sede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c4444444-4444-4444-8444-444444444444', 5, 'praise',
 '¡Excelente! Sabes pedir comida y hablar de alimentación. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Júpiter (Viajes y Desplazamientos)
('c5555555-5555-4555-8555-555555555555', 1, 'teach',
 'Para pedir información: "Disculpe, ¿dónde está la estación de tren?" en portugués es "com licença, onde fica a estação de trem?". Escucha: com licença, onde fica a estação de trem? Ahora repite.',
 'com licença, onde fica a estação de trem?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c5555555-5555-4555-8555-555555555555', 2, 'repeat',
 '¡Muy bien! Una vez más, con calma y claridad.',
 'com licença, onde fica a estação de trem?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c5555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Necesito reservar una habitación de hotel" en portugués es "eu preciso reservar um quarto de hotel". Escucha: eu preciso reservar um quarto de hotel. Ahora te toca.',
 'eu preciso reservar um quarto de hotel', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c5555555-5555-4555-8555-555555555555', 4, 'question',
 '¿Cómo se dice "gira a la izquierda en el semáforo" en portugués?',
 'vire à esquerda no semáforo', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c5555555-5555-4555-8555-555555555555', 5, 'praise',
 '¡Buen trabajo! Ya puedes orientarte. Sigamos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturno (Salud y Emociones)
('c6666666-6666-4666-8666-666666666666', 1, 'teach',
 '"hoy no me siento bien" en portugués es "não estou me sentindo bem hoje". Escucha: não estou me sentindo bem hoje. Ahora repite.',
 'não estou me sentindo bem hoje', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c6666666-6666-4666-8666-666666666666', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'não estou me sentindo bem hoje', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c6666666-6666-4666-8666-666666666666', 3, 'teach',
 'Para dar consejos: "deberías ver a un médico" en portugués es "você deveria consultar um médico". Escucha: você deveria consultar um médico.',
 'você deveria consultar um médico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c6666666-6666-4666-8666-666666666666', 4, 'question',
 '¿Cómo preguntas "¿te sientes mejor ahora?" en portugués?',
 'você está se sentindo melhor agora?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c6666666-6666-4666-8666-666666666666', 5, 'praise',
 '¡Excelente! Sabes hablar de salud y sentimientos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Urano (Trabajo y Negocios)
('c7777777-7777-4777-8777-777777777777', 1, 'teach',
 'En el trabajo: "¿Podemos agendar una reunión para el lunes?" en portugués es "podemos agendar uma reunião para segunda-feira?". Escucha: podemos agendar uma reunião para segunda-feira? Ahora repite.',
 'podemos agendar uma reunião para segunda-feira?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c7777777-7777-4777-8777-777777777777', 2, 'repeat',
 '¡Muy bien! Una vez más, por favor.',
 'podemos agendar uma reunião para segunda-feira?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c7777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Te enviaré el informe por correo electrónico" en portugués es "vou enviar o relatório por e-mail". Escucha: vou enviar o relatório por e-mail.',
 'vou enviar o relatório por e-mail', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c7777777-7777-4777-8777-777777777777', 4, 'question',
 '¿Cómo se dice "necesitamos terminar el proyecto para el viernes" en portugués?',
 'precisamos terminar o projeto até sexta-feira', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c7777777-7777-4777-8777-777777777777', 5, 'praise',
 '¡Buen trabajo! Estás construyendo portugués profesional de verdad.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptuno (Conversaciones Avanzadas)
('c8888888-8888-4888-8888-888888888888', 1, 'teach',
 'Para dar una opinión: "en mi opinión, esta es una gran idea" en portugués es "na minha opinião, esta é uma ótima ideia". Escucha: na minha opinião, esta é uma ótima ideia. Ahora repite.',
 'na minha opinião, esta é uma ótima ideia', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c8888888-8888-4888-8888-888888888888', 2, 'repeat',
 '¡Muy bien! Dilo otra vez con ritmo natural.',
 'na minha opinião, esta é uma ótima ideia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c8888888-8888-4888-8888-888888888888', 3, 'teach',
 'Una expresión útil: "¡es pan comido!" en portugués es "é moleza!". Escucha: é moleza!.',
 'é moleza!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c8888888-8888-4888-8888-888888888888', 4, 'question',
 '¿Cómo se dice "no puedo esperar para verte" en portugués?',
 'mal posso esperar para te ver', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('c8888888-8888-4888-8888-888888888888', 5, 'praise',
 '¡Increíble! Estás hablando con naturalidad y confianza.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
