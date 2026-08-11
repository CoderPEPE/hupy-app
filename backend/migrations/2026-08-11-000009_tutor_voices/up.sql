-- ---------------------------------------------------------------------------
-- Tutor voice catalog.
--
-- The list used to live hardcoded in the app AND in a Rust const, so a wrong
-- gender label needed an app release to fix. It lives here now: the API
-- serves this table, `users.voice` is validated against it, and relabeling a
-- voice is one UPDATE.
--
-- Only voices BOTH OpenAI APIs accept belong here. /v1/audio/speech also
-- takes fable/nova/onyx, but gpt-realtime rejects them — storing one of those
-- on a user would 400 every tutor session.
--
-- pitch_hz is each voice's measured median fundamental frequency (spoken by
-- gpt-4o-mini-tts; autocorrelation and harmonic-product-spectrum estimates
-- agreed within ~5 Hz). It sorts each group bright -> deep and is the
-- evidence behind the gender labels: `ballad` (180 Hz, same as sage and
-- marin) was previously listed as male, which is why a "male" voice sounded
-- female in the picker.
-- ---------------------------------------------------------------------------

CREATE TABLE tutor_voices (
    id       VARCHAR(32) PRIMARY KEY,
    name     VARCHAR(64) NOT NULL,
    gender   VARCHAR(8)  NOT NULL CHECK (gender IN ('female', 'male')),
    pitch_hz INTEGER     NOT NULL
);

INSERT INTO tutor_voices (id, name, gender, pitch_hz) VALUES
    ('coral',   'Coral',   'female', 219),
    ('marin',   'Marin',   'female', 187),
    ('ballad',  'Ballad',  'female', 180),
    ('sage',    'Sage',    'female', 180),
    ('shimmer', 'Shimmer', 'female', 150),
    ('verse',   'Verse',   'male',   168),
    ('cedar',   'Cedar',   'male',   146),
    ('alloy',   'Alloy',   'male',   132),
    ('echo',    'Echo',    'male',   117),
    ('ash',     'Ash',     'male',   111);
