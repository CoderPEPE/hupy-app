ALTER TABLE users DROP CONSTRAINT IF EXISTS users_utc_offset_minutes_range;
ALTER TABLE users DROP COLUMN IF EXISTS utc_offset_minutes;
