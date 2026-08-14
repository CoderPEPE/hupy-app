-- hupy learning system: planets, sentences, progress, conversations,
-- corrections, flashcards with spaced repetition.

CREATE TABLE planets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number INT NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255) NOT NULL,
    color VARCHAR(16) NOT NULL DEFAULT '#4A44BE',
    topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    unlock_mastery DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE planet_sentences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    position INT NOT NULL,
    en VARCHAR(512) NOT NULL,
    pt VARCHAR(512) NOT NULL,
    subject VARCHAR(128) NOT NULL DEFAULT '',
    verb VARCHAR(128) NOT NULL DEFAULT '',
    complement VARCHAR(512) NOT NULL DEFAULT '',
    UNIQUE (planet_id, position)
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    planet_id UUID REFERENCES planets(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Live conversation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    said TEXT NOT NULL,
    corrected TEXT NOT NULL,
    explanation TEXT NOT NULL,
    pt VARCHAR(512) NOT NULL DEFAULT '',
    mistake_part VARCHAR(255) NOT NULL DEFAULT '',
    subject VARCHAR(128) NOT NULL DEFAULT '',
    verb VARCHAR(128) NOT NULL DEFAULT '',
    complement VARCHAR(512) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    planet_id UUID REFERENCES planets(id) ON DELETE SET NULL,
    correction_id UUID REFERENCES corrections(id) ON DELETE SET NULL,
    en VARCHAR(512) NOT NULL,
    pt VARCHAR(512) NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    subject VARCHAR(128) NOT NULL DEFAULT '',
    verb VARCHAR(128) NOT NULL DEFAULT '',
    complement VARCHAR(512) NOT NULL DEFAULT '',
    source VARCHAR(32) NOT NULL DEFAULT 'correction',
    interval_days INT NOT NULL DEFAULT 0,
    ease DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    repetitions INT NOT NULL DEFAULT 0,
    next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE card_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    rating VARCHAR(16) NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_planet_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
    sentences DOUBLE PRECISION NOT NULL DEFAULT 0,
    pronunciation DOUBLE PRECISION NOT NULL DEFAULT 0,
    conversation DOUBLE PRECISION NOT NULL DEFAULT 0,
    listening DOUBLE PRECISION NOT NULL DEFAULT 0,
    flashcards DOUBLE PRECISION NOT NULL DEFAULT 0,
    review DOUBLE PRECISION NOT NULL DEFAULT 0,
    mastery DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, planet_id)
);

CREATE TABLE user_sentence_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sentence_id UUID NOT NULL REFERENCES planet_sentences(id) ON DELETE CASCADE,
    mastered BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, sentence_id)
);

-- ---------------------------------------------------------------------------
-- Seed the first three planets (per the product spec, Planet 1..3).
-- ---------------------------------------------------------------------------

INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery) VALUES
('11111111-1111-4111-8111-111111111111', 1, 'First Contacts',
 'Greetings, introductions, days & months', '#4A44BE',
 '["Greetings","Personal introductions","Asking & answering how you are","Farewells","Days of the week","Months & seasons","Times and parts of the day","Basic social phrases"]'::jsonb,
 0.8),
('22222222-2222-4222-8222-222222222222', 2, 'Routine & Actions',
 'Most used verbs, work, school, driving', '#6C63E0',
 '["Most commonly used verbs","Going to work / school","Driving","Eating & drinking","Needing & wanting","Doing / making / fixing","Common routine phrases"]'::jsonb,
 0.8),
('33333333-3333-4333-8333-333333333333', 3, 'Work & Daily Life',
 'Explaining, asking for help, schedules', '#8B7DF6',
 '["Explaining what I am doing","Asking for help","Reporting problems","Talking about schedules","Coordinating tasks","Describing events"]'::jsonb,
 0.8);

INSERT INTO planet_sentences (planet_id, position, en, pt, subject, verb, complement) VALUES
-- Planet 1 — First Contacts
('11111111-1111-4111-8111-111111111111', 1, 'Good morning', 'Bom dia', '', '', 'Good morning'),
('11111111-1111-4111-8111-111111111111', 2, 'Good afternoon', 'Boa tarde', '', '', 'Good afternoon'),
('11111111-1111-4111-8111-111111111111', 3, 'Good evening', 'Boa noite (ao chegar)', '', '', 'Good evening'),
('11111111-1111-4111-8111-111111111111', 4, 'Hello, how are you?', 'Olá, como você está?', 'you', 'are', 'how'),
('11111111-1111-4111-8111-111111111111', 5, 'I''m fine, thank you. And you?', 'Estou bem, obrigado. E você?', 'I', '''m (am)', 'fine, thank you'),
('11111111-1111-4111-8111-111111111111', 6, 'Nice to meet you', 'Prazer em conhecê-lo', '', '', 'Nice to meet you'),
('11111111-1111-4111-8111-111111111111', 7, 'What is your name?', 'Qual é o seu nome?', 'your name', 'is', 'what'),
('11111111-1111-4111-8111-111111111111', 8, 'My name is Sergio', 'Meu nome é Sergio', 'My name', 'is', 'Sergio'),
('11111111-1111-4111-8111-111111111111', 9, 'Goodbye, see you tomorrow', 'Adeus, até amanhã', '', '', 'Goodbye, see you tomorrow'),
('11111111-1111-4111-8111-111111111111', 10, 'Today is Monday', 'Hoje é segunda-feira', 'Today', 'is', 'Monday'),
-- Planet 2 — Routine & Actions
('22222222-2222-4222-8222-222222222222', 1, 'I work every day', 'Eu trabalho todos os dias', 'I', 'work', 'every day'),
('22222222-2222-4222-8222-222222222222', 2, 'I worked yesterday', 'Eu trabalhei ontem', 'I', 'worked', 'yesterday'),
('22222222-2222-4222-8222-222222222222', 3, 'I will work tomorrow', 'Eu vou trabalhar amanhã', 'I', 'will work', 'tomorrow'),
('22222222-2222-4222-8222-222222222222', 4, 'I don''t work on Sundays', 'Eu não trabalho aos domingos', 'I', 'don''t work', 'on Sundays'),
('22222222-2222-4222-8222-222222222222', 5, 'Do you work here?', 'Você trabalha aqui?', 'you', 'work', 'here'),
-- Planet 3 — Work & Daily Life
('33333333-3333-4333-8333-333333333333', 1, 'I need help', 'Eu preciso de ajuda', 'I', 'need', 'help'),
('33333333-3333-4333-8333-333333333333', 2, 'Can you help me, please?', 'Você pode me ajudar, por favor?', 'you', 'can help', 'me'),
('33333333-3333-4333-8333-333333333333', 3, 'There is a problem with my computer', 'Há um problema com o meu computador', 'There', 'is', 'a problem with my computer');
