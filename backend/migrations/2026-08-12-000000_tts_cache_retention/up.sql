-- The TTS cache is pruned opportunistically on every cache write (entries
-- older than TTS_CACHE_MAX_AGE_DAYS are deleted); the index keeps that sweep
-- cheap as the table grows.
CREATE INDEX idx_tts_audio_created_at ON tts_audio (created_at);
