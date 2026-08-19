-- The daily streak was computed on the UTC calendar date, so a learner in
-- Brazil (UTC-3) practising after 21:00 local time was recorded on
-- *tomorrow's* UTC date: evening sessions stalled or broke the streak they
-- had just earned. Storing the learner's offset lets the streak be computed
-- in their own calendar frame.
--
-- Minutes, not hours: not every zone is a whole hour off UTC (India is +330,
-- Nepal +345). Signed, east of UTC positive — the same convention as
-- JavaScript's negated getTimezoneOffset().
ALTER TABLE users
    ADD COLUMN utc_offset_minutes INTEGER NOT NULL DEFAULT 0;

-- Guard against a junk or hostile value reaching the date math.
ALTER TABLE users
    ADD CONSTRAINT users_utc_offset_minutes_range
    CHECK (utc_offset_minutes BETWEEN -840 AND 840);
