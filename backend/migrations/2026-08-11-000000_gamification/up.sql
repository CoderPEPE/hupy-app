-- Gamification: streaks, XP, badges — plus a flag marking whether an
-- "easy"-rated flashcard has actually been re-confirmed live by the tutor
-- (spec: don't trust a self-rated "easy" until the AI re-tests it).

ALTER TABLE flashcards ADD COLUMN verified_live BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp INT NOT NULL DEFAULT 0,
    streak_days INT NOT NULL DEFAULT 0,
    longest_streak INT NOT NULL DEFAULT 0,
    last_active_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description VARCHAR(512) NOT NULL,
    icon VARCHAR(32) NOT NULL DEFAULT 'star'
);

CREATE TABLE user_badges (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, badge_id)
);

INSERT INTO badges (code, title, description, icon) VALUES
('first_correction', 'First Correction', 'Received your first pronunciation or grammar correction', 'sparkles'),
('first_flashcard', 'Card Collector', 'Created your first flashcard', 'layers'),
('first_conversation', 'First Contact', 'Completed your first live conversation with hupy', 'message-circle'),
('streak_3', '3-Day Streak', 'Practiced 3 days in a row', 'flame'),
('streak_7', '7-Day Streak', 'Practiced 7 days in a row', 'flame'),
('planet_1_complete', 'Mercury Mastered', 'Completed your first planet', 'rocket'),
('cards_50', 'Fifty Cards', 'Reviewed 50 flashcards', 'trophy');
