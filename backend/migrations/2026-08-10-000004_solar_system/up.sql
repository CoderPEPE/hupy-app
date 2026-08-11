-- ---------------------------------------------------------------------------
-- Turn the 3 thematic planets into the full solar system (Mercury..Neptune).
-- Each planet keeps its learning theme in the subtitle; the title becomes the
-- planet name so the app can present a Mario-style world-by-world journey.
-- ---------------------------------------------------------------------------

UPDATE planets SET
    title = 'Mercury',
    subtitle = 'First Contacts — greetings, introductions, days & months',
    color = '#9CA3AF'
WHERE number = 1;

UPDATE planets SET
    title = 'Venus',
    subtitle = 'Routine & Actions — work, school, driving, eating',
    color = '#E8B64C'
WHERE number = 2;

UPDATE planets SET
    title = 'Earth',
    subtitle = 'Work & Daily Life — help, schedules, problems',
    color = '#4A90D9'
WHERE number = 3;

INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery) VALUES
('44444444-4444-4444-8444-444444444444', 4, 'Mars',
 'Food & Eating — ordering, cooking, groceries', '#E2574C',
 '["Restaurant & ordering","Cooking at home","Groceries & shopping","Food preferences","Meals of the day"]'::jsonb, 0.8),
('55555555-5555-4555-8555-555555555555', 5, 'Jupiter',
 'Travel & Getting Around — directions, transport, tickets', '#D19A66',
 '["Asking for directions","Public transport","Booking & tickets","At the airport","Travel questions"]'::jsonb, 0.8),
('66666666-6666-4666-8666-666666666666', 6, 'Saturn',
 'Health & Emotions — doctor, body, feelings', '#E0C068',
 '["Feeling unwell","At the doctor","Body parts","Emotions & feelings","Giving advice"]'::jsonb, 0.8),
('77777777-7777-4777-8777-777777777777', 7, 'Uranus',
 'Work & Business — meetings, emails, calls', '#6FC7C9',
 '["Meetings","Emails & messages","Phone calls","Professional small talk","Jobs & duties"]'::jsonb, 0.8),
('88888888-8888-4888-8888-888888888888', 8, 'Neptune',
 'Advanced Conversations — opinions, stories, idioms', '#4A63D9',
 '["Opinions & arguments","Storytelling","Hypotheticals","Idioms & expressions","Natural fluency"]'::jsonb, 0.8);

-- ---------------------------------------------------------------------------
-- Sentences for the new planets
-- ---------------------------------------------------------------------------
INSERT INTO planet_sentences (planet_id, position, en, pt, subject, verb, complement) VALUES
-- Mars — Food & Eating
('44444444-4444-4444-8444-444444444444', 1, 'I would like to order a pizza, please.', 'Eu gostaria de pedir uma pizza, por favor.', 'I', 'would like', 'to order a pizza'),
('44444444-4444-4444-8444-444444444444', 2, 'The food is delicious.', 'A comida está deliciosa.', 'The food', 'is', 'delicious'),
('44444444-4444-4444-8444-444444444444', 3, 'Can I have the menu, please?', 'Posso ver o cardápio, por favor?', 'I', 'can have', 'the menu'),
('44444444-4444-4444-8444-444444444444', 4, 'I don''t eat meat.', 'Eu não como carne.', 'I', 'don''t eat', 'meat'),
('44444444-4444-4444-8444-444444444444', 5, 'Let''s cook dinner together.', 'Vamos cozinhar o jantar juntos.', 'Let''s', 'cook', 'dinner together'),
('44444444-4444-4444-8444-444444444444', 6, 'I''m thirsty.', 'Estou com sede.', 'I', '''m (am)', 'thirsty'),
-- Jupiter — Travel & Getting Around
('55555555-5555-4555-8555-555555555555', 1, 'Excuse me, where is the train station?', 'Com licença, onde fica a estação de trem?', 'the train station', 'is', 'where'),
('55555555-5555-4555-8555-555555555555', 2, 'How much is a ticket to the city center?', 'Quanto custa uma passagem para o centro da cidade?', 'a ticket', 'costs', 'how much'),
('55555555-5555-4555-8555-555555555555', 3, 'I need to book a hotel room.', 'Eu preciso reservar um quarto de hotel.', 'I', 'need', 'to book a hotel room'),
('55555555-5555-4555-8555-555555555555', 4, 'The bus is late today.', 'O ônibus está atrasado hoje.', 'The bus', 'is', 'late today'),
('55555555-5555-4555-8555-555555555555', 5, 'We are flying to London tomorrow.', 'Nós vamos voar para Londres amanhã.', 'We', 'are flying', 'to London tomorrow'),
('55555555-5555-4555-8555-555555555555', 6, 'Turn left at the traffic light.', 'Vire à esquerda no semáforo.', 'You', 'turn', 'left at the traffic light'),
-- Saturn — Health & Emotions
('66666666-6666-4666-8666-666666666666', 1, 'I don''t feel well today.', 'Não estou me sentindo bem hoje.', 'I', 'don''t feel', 'well today'),
('66666666-6666-4666-8666-666666666666', 2, 'My head hurts.', 'Minha cabeça dói.', 'My head', 'hurts', ''),
('66666666-6666-4666-8666-666666666666', 3, 'You should see a doctor.', 'Você deveria consultar um médico.', 'You', 'should see', 'a doctor'),
('66666666-6666-4666-8666-666666666666', 4, 'I am tired and stressed.', 'Estou cansado e estressado.', 'I', 'am', 'tired and stressed'),
('66666666-6666-4666-8666-666666666666', 5, 'Are you feeling better now?', 'Você está se sentindo melhor agora?', 'you', 'are feeling', 'better now'),
('66666666-6666-4666-8666-666666666666', 6, 'Take this medicine twice a day.', 'Tome este remédio duas vezes ao dia.', 'You', 'take', 'this medicine twice a day'),
-- Uranus — Work & Business
('77777777-7777-4777-8777-777777777777', 1, 'Can we schedule a meeting for Monday?', 'Podemos agendar uma reunião para segunda-feira?', 'we', 'can schedule', 'a meeting for Monday'),
('77777777-7777-4777-8777-777777777777', 2, 'I will send you the report by email.', 'Vou enviar o relatório por e-mail.', 'I', 'will send', 'you the report by email'),
('77777777-7777-4777-8777-777777777777', 3, 'Could you call me back later?', 'Você poderia me ligar de volta mais tarde?', 'you', 'could call', 'me back later'),
('77777777-7777-4777-8777-777777777777', 4, 'We need to finish the project by Friday.', 'Precisamos terminar o projeto até sexta-feira.', 'We', 'need', 'to finish the project by Friday'),
('77777777-7777-4777-8777-777777777777', 5, 'I work in sales.', 'Eu trabalho em vendas.', 'I', 'work', 'in sales'),
('77777777-7777-4777-8777-777777777777', 6, 'Let''s discuss this in the meeting.', 'Vamos discutir isso na reunião.', 'Let''s', 'discuss', 'this in the meeting'),
-- Neptune — Advanced Conversations
('88888888-8888-4888-8888-888888888888', 1, 'In my opinion, this is a great idea.', 'Na minha opinião, esta é uma ótima ideia.', 'this', 'is', 'a great idea'),
('88888888-8888-4888-8888-888888888888', 2, 'If I had more time, I would travel more.', 'Se eu tivesse mais tempo, viajaria mais.', 'I', 'would travel', 'more'),
('88888888-8888-4888-8888-888888888888', 3, 'It''s a piece of cake!', 'É moleza!', 'It', '''s (is)', 'a piece of cake'),
('88888888-8888-4888-8888-888888888888', 4, 'I can''t wait to see you.', 'Mal posso esperar para te ver.', 'I', 'can''t wait', 'to see you'),
('88888888-8888-4888-8888-888888888888', 5, 'Tell me a story about your childhood.', 'Conte-me uma história sobre sua infância.', 'You', 'tell', 'me a story about your childhood'),
('88888888-8888-4888-8888-888888888888', 6, 'She has a lot of experience.', 'Ela tem muita experiência.', 'She', 'has', 'a lot of experience');

-- ---------------------------------------------------------------------------
-- Lesson steps for the new planets (teach -> repeat -> teach -> question -> praise)
-- ---------------------------------------------------------------------------
INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mars
('44444444-4444-4444-8444-444444444444', 1, 'teach',
 'Sergio, "eu gostaria de pedir uma pizza" em inglês é "I would like to order a pizza, please". Listen: I would like to order a pizza. Now repeat.',
 'I would like to order a pizza, please', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('44444444-4444-4444-8444-444444444444', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'I would like to order a pizza, please', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('44444444-4444-4444-8444-444444444444', 3, 'teach',
 'Para negar: "eu não como carne" é "I don''t eat meat". Listen: I don''t eat meat. Now you try.',
 'I don''t eat meat', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('44444444-4444-4444-8444-444444444444', 4, 'question',
 'How do you say "estou com sede" em inglês?',
 'I''m thirsty', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('44444444-4444-4444-8444-444444444444', 5, 'praise',
 'Excellent! You can order food and talk about eating. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Jupiter
('55555555-5555-4555-8555-555555555555', 1, 'teach',
 'Sergio, para pedir informações: "com licença, onde fica a estação de trem?" em inglês é "Excuse me, where is the train station?". Listen: Excuse me, where is the train station? Now repeat.',
 'Excuse me, where is the train station?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('55555555-5555-4555-8555-555555555555', 2, 'repeat',
 'Very good! One more time, nice and clear.',
 'Excuse me, where is the train station?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('55555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Eu preciso reservar um quarto de hotel" é "I need to book a hotel room". Listen: I need to book a hotel room. Now it''s your turn.',
 'I need to book a hotel room', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('55555555-5555-4555-8555-555555555555', 4, 'question',
 'How do you say "vire à esquerda no semáforo"?',
 'Turn left at the traffic light', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('55555555-5555-4555-8555-555555555555', 5, 'praise',
 'Great job! You can find your way around. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturn
('66666666-6666-4666-8666-666666666666', 1, 'teach',
 'Sergio, "não estou me sentindo bem hoje" em inglês é "I don''t feel well today". Listen: I don''t feel well today. Now repeat.',
 'I don''t feel well today', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('66666666-6666-4666-8666-666666666666', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'I don''t feel well today', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('66666666-6666-4666-8666-666666666666', 3, 'teach',
 'Para dar conselho: "você deveria consultar um médico" é "You should see a doctor". Listen: You should see a doctor.',
 'You should see a doctor', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('66666666-6666-4666-8666-666666666666', 4, 'question',
 'How do you ask "você está se sentindo melhor agora?"',
 'Are you feeling better now?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('66666666-6666-4666-8666-666666666666', 5, 'praise',
 'Excellent! You can talk about health and feelings.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Uranus
('77777777-7777-4777-8777-777777777777', 1, 'teach',
 'Sergio, no trabalho: "podemos agendar uma reunião para segunda-feira?" em inglês é "Can we schedule a meeting for Monday?". Listen: Can we schedule a meeting for Monday? Now repeat.',
 'Can we schedule a meeting for Monday?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('77777777-7777-4777-8777-777777777777', 2, 'repeat',
 'Very good! One more time, please.',
 'Can we schedule a meeting for Monday?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('77777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Vou enviar o relatório por e-mail" é "I will send you the report by email". Listen: I will send you the report by email.',
 'I will send you the report by email', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('77777777-7777-4777-8777-777777777777', 4, 'question',
 'How do you say "precisamos terminar o projeto até sexta-feira"?',
 'We need to finish the project by Friday', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('77777777-7777-4777-8777-777777777777', 5, 'praise',
 'Great job! You are building real professional English.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptune
('88888888-8888-4888-8888-888888888888', 1, 'teach',
 'Sergio, para dar opinião: "na minha opinião, esta é uma ótima ideia" em inglês é "In my opinion, this is a great idea". Listen: In my opinion, this is a great idea. Now repeat.',
 'In my opinion, this is a great idea', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('88888888-8888-4888-8888-888888888888', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'In my opinion, this is a great idea', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('88888888-8888-4888-8888-888888888888', 3, 'teach',
 'Uma expressão útil: "é moleza!" é "It''s a piece of cake!". Listen: It''s a piece of cake.',
 'It''s a piece of cake!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('88888888-8888-4888-8888-888888888888', 4, 'question',
 'How do you say "mal posso esperar para te ver"?',
 'I can''t wait to see you', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('88888888-8888-4888-8888-888888888888', 5, 'praise',
 'Outstanding! You are speaking naturally and with confidence.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- Lessons: 4 per planet (Learn, Practice, Test, Master) shown as the winding
-- path in the app. Completion is derived server-side from the user's progress
-- (see planets.rs), so no separate progress table is needed.
-- ---------------------------------------------------------------------------
CREATE TABLE planet_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    position INT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('learn', 'practice', 'test', 'master')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    UNIQUE (planet_id, position)
);

CREATE INDEX planet_lessons_planet_idx ON planet_lessons (planet_id, position);

INSERT INTO planet_lessons (planet_id, position, kind, title, description)
SELECT p.id, l.position, l.kind, l.title, l.description
FROM planets p
CROSS JOIN (VALUES
    (1, 'learn',    'Learn',    'New words and phrases'),
    (2, 'practice', 'Practice', 'Repeat and practice'),
    (3, 'test',     'Test',     'Test your memory'),
    (4, 'master',   'Master',   'Use in conversation')
) AS l(position, kind, title, description)
ORDER BY p.number, l.position;
