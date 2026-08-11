-- Cache generated TTS audio so repeated listens (flashcards, planet audio)
-- don't re-bill OpenAI every time.
CREATE TABLE tts_audio (
    cache_key VARCHAR(64) PRIMARY KEY,
    text TEXT NOT NULL,
    voice VARCHAR(64) NOT NULL,
    model VARCHAR(64) NOT NULL,
    speed DOUBLE PRECISION NOT NULL,
    audio BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign-key indexes for the learning-system tables.
CREATE INDEX idx_messages_conversation ON messages (conversation_id);
CREATE INDEX idx_corrections_conversation ON corrections (conversation_id);
CREATE INDEX idx_corrections_user ON corrections (user_id);
CREATE INDEX idx_flashcards_user ON flashcards (user_id);
CREATE INDEX idx_flashcards_planet ON flashcards (planet_id);
CREATE INDEX idx_card_reviews_flashcard ON card_reviews (flashcard_id);
CREATE INDEX idx_planet_sentences_planet ON planet_sentences (planet_id);
