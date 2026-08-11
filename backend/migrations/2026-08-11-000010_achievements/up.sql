-- 100 achievements, defined as DATA rather than code.
--
-- Every badge carries the rule that earns it: a `metric` (a per-user counter
-- the server already knows how to compute), a `threshold` to reach, and an
-- optional `scope` (a planet number, for the per-planet lesson badges). The
-- gamification service computes each counter once and awards everything that
-- qualifies — so adding badge #101 is an INSERT, not a code change.
--
-- Metrics: corrections, flashcards, card_reviews, cards_verified,
-- conversations, messages, sentences_mastered, lessons_completed,
-- planet_lessons (scoped), planets_completed, streak_days, longest_streak, xp.

ALTER TABLE badges
    ADD COLUMN metric     VARCHAR(32) NOT NULL DEFAULT 'manual',
    ADD COLUMN threshold  INT         NOT NULL DEFAULT 1,
    -- Planet number for planet-scoped metrics; NULL for account-wide ones.
    ADD COLUMN scope      INT,
    ADD COLUMN category   VARCHAR(24) NOT NULL DEFAULT 'general',
    ADD COLUMN tier       VARCHAR(12) NOT NULL DEFAULT 'bronze',
    ADD COLUMN xp_reward  INT         NOT NULL DEFAULT 10,
    ADD COLUMN sort_order INT         NOT NULL DEFAULT 0;

-- The seven original badges keep their ids (user_badges references them) and
-- gain the rule that was previously hardcoded in Rust.
UPDATE badges SET metric = 'corrections',       threshold = 1,  category = 'corrections',   tier = 'bronze', xp_reward = 10, sort_order = 8000 WHERE code = 'first_correction';
UPDATE badges SET metric = 'flashcards',        threshold = 1,  category = 'cards',         tier = 'bronze', xp_reward = 10, sort_order = 5000 WHERE code = 'first_flashcard';
UPDATE badges SET metric = 'conversations',     threshold = 1,  category = 'conversation',  tier = 'bronze', xp_reward = 10, sort_order = 7000 WHERE code = 'first_conversation';
UPDATE badges SET metric = 'streak_days',       threshold = 3,  category = 'streak',        tier = 'bronze', xp_reward = 10, sort_order = 9020 WHERE code = 'streak_3';
UPDATE badges SET metric = 'streak_days',       threshold = 7,  category = 'streak',        tier = 'silver', xp_reward = 25, sort_order = 9040 WHERE code = 'streak_7';
UPDATE badges SET metric = 'planets_completed', threshold = 1,  category = 'planets',       tier = 'silver', xp_reward = 25, sort_order = 2010 WHERE code = 'planet_1_complete';
UPDATE badges SET metric = 'card_reviews',      threshold = 50, category = 'cards',         tier = 'silver', xp_reward = 25, sort_order = 6030 WHERE code = 'cards_50';

INSERT INTO badges (code, title, description, icon, metric, threshold, scope, category, tier, xp_reward, sort_order) VALUES
-- ---------------------------------------------------------------- lessons --
-- Total lessons finished across the course (4 per planet x 8 planets = 32).
('lessons_1',  'First Steps',        'Finish your first lesson',                     'book-open',      'lessons_completed', 1,  NULL, 'lessons', 'bronze',   10, 1010),
('lessons_2',  'Getting Warm',       'Finish 2 lessons',                             'book-open',      'lessons_completed', 2,  NULL, 'lessons', 'bronze',   10, 1020),
('lessons_3',  'Three in Orbit',     'Finish 3 lessons',                             'book-open',      'lessons_completed', 3,  NULL, 'lessons', 'bronze',   10, 1030),
('lessons_5',  'Study Habit',        'Finish 5 lessons',                             'book-open',      'lessons_completed', 5,  NULL, 'lessons', 'bronze',   10, 1050),
('lessons_8',  'Course Cruiser',     'Finish 8 lessons',                             'graduation-cap', 'lessons_completed', 8,  NULL, 'lessons', 'silver',   25, 1080),
('lessons_12', 'Quarter Deck',       'Finish 12 lessons',                            'graduation-cap', 'lessons_completed', 12, NULL, 'lessons', 'silver',   25, 1120),
('lessons_16', 'Halfway There',      'Finish 16 lessons — half the whole path',      'graduation-cap', 'lessons_completed', 16, NULL, 'lessons', 'silver',   25, 1160),
('lessons_20', 'Twenty Down',        'Finish 20 lessons',                            'graduation-cap', 'lessons_completed', 20, NULL, 'lessons', 'gold',     50, 1200),
('lessons_24', 'Home Stretch',       'Finish 24 lessons',                            'medal',          'lessons_completed', 24, NULL, 'lessons', 'gold',     50, 1240),
('lessons_28', 'Almost Everything',  'Finish 28 lessons',                            'medal',          'lessons_completed', 28, NULL, 'lessons', 'gold',     50, 1280),
('lessons_32', 'Full Curriculum',    'Finish all 32 lessons of the course',          'crown',          'lessons_completed', 32, NULL, 'lessons', 'platinum',100, 1320),

-- All four lessons (Learn, Practice, Test, Master) of one planet.
('planet_1_lessons', 'Mercury Scholar', 'Finish all 4 lessons on Mercury',           'award', 'planet_lessons', 4, 1, 'lessons', 'silver', 25, 1410),
('planet_2_lessons', 'Venus Scholar',   'Finish all 4 lessons on Venus',             'award', 'planet_lessons', 4, 2, 'lessons', 'silver', 25, 1420),
('planet_3_lessons', 'Earth Scholar',   'Finish all 4 lessons on Earth',             'award', 'planet_lessons', 4, 3, 'lessons', 'silver', 25, 1430),
('planet_4_lessons', 'Mars Scholar',    'Finish all 4 lessons on Mars',              'award', 'planet_lessons', 4, 4, 'lessons', 'gold',   50, 1440),
('planet_5_lessons', 'Jupiter Scholar', 'Finish all 4 lessons on Jupiter',           'award', 'planet_lessons', 4, 5, 'lessons', 'gold',   50, 1450),
('planet_6_lessons', 'Saturn Scholar',  'Finish all 4 lessons on Saturn',            'award', 'planet_lessons', 4, 6, 'lessons', 'gold',   50, 1460),
('planet_7_lessons', 'Uranus Scholar',  'Finish all 4 lessons on Uranus',            'award', 'planet_lessons', 4, 7, 'lessons', 'gold',   50, 1470),
('planet_8_lessons', 'Neptune Scholar', 'Finish all 4 lessons on Neptune',           'crown', 'planet_lessons', 4, 8, 'lessons', 'platinum', 100, 1480),

-- Setting foot on each planet: its first lesson done.
('planet_2_landing', 'Venus Landing',   'Finish your first lesson on Venus',         'flag', 'planet_lessons', 1, 2, 'lessons', 'bronze', 10, 1520),
('planet_3_landing', 'Earth Landing',   'Finish your first lesson on Earth',         'flag', 'planet_lessons', 1, 3, 'lessons', 'bronze', 10, 1530),
('planet_4_landing', 'Mars Landing',    'Finish your first lesson on Mars',          'flag', 'planet_lessons', 1, 4, 'lessons', 'bronze', 10, 1540),
('planet_5_landing', 'Jupiter Landing', 'Finish your first lesson on Jupiter',       'flag', 'planet_lessons', 1, 5, 'lessons', 'bronze', 10, 1550),
('planet_6_landing', 'Saturn Landing',  'Finish your first lesson on Saturn',        'flag', 'planet_lessons', 1, 6, 'lessons', 'bronze', 10, 1560),
('planet_7_landing', 'Uranus Landing',  'Finish your first lesson on Uranus',        'flag', 'planet_lessons', 1, 7, 'lessons', 'bronze', 10, 1570),
('planet_8_landing', 'Neptune Landing', 'Finish your first lesson on Neptune',       'flag', 'planet_lessons', 1, 8, 'lessons', 'silver', 25, 1580),

-- ---------------------------------------------------------------- planets --
('planets_2', 'Two Worlds',        'Complete 2 planets',                             'rocket',  'planets_completed', 2, NULL, 'planets', 'silver',   25, 2020),
('planets_3', 'Inner System',      'Complete 3 planets',                             'rocket',  'planets_completed', 3, NULL, 'planets', 'silver',   25, 2030),
('planets_4', 'Four Down',         'Complete 4 planets',                             'rocket',  'planets_completed', 4, NULL, 'planets', 'gold',     50, 2040),
('planets_5', 'Gas Giant',         'Complete 5 planets',                             'globe',   'planets_completed', 5, NULL, 'planets', 'gold',     50, 2050),
('planets_6', 'Ringed World',      'Complete 6 planets',                             'globe',   'planets_completed', 6, NULL, 'planets', 'gold',     50, 2060),
('planets_7', 'Outer Reaches',     'Complete 7 planets',                             'globe',   'planets_completed', 7, NULL, 'planets', 'platinum', 100, 2070),
('planets_8', 'Solar System',      'Complete every planet in the system',            'crown',   'planets_completed', 8, NULL, 'planets', 'platinum', 100, 2080),

-- -------------------------------------------------------------- sentences --
('sentences_1',   'First Phrase',    'Master your first sentence',                   'star',    'sentences_mastered', 1,   NULL, 'sentences', 'bronze',   10, 3010),
('sentences_5',   'Five Phrases',    'Master 5 sentences',                           'star',    'sentences_mastered', 5,   NULL, 'sentences', 'bronze',   10, 3050),
('sentences_10',  'Ten Phrases',     'Master 10 sentences',                          'star',    'sentences_mastered', 10,  NULL, 'sentences', 'bronze',   10, 3100),
('sentences_25',  'Phrase Book',     'Master 25 sentences',                          'sparkles','sentences_mastered', 25,  NULL, 'sentences', 'silver',   25, 3250),
('sentences_50',  'Fifty Strong',    'Master 50 sentences',                          'sparkles','sentences_mastered', 50,  NULL, 'sentences', 'silver',   25, 3500),
('sentences_75',  'Seventy-Five',    'Master 75 sentences',                          'sparkles','sentences_mastered', 75,  NULL, 'sentences', 'silver',   25, 3750),
('sentences_100', 'Century',         'Master 100 sentences',                         'gem',     'sentences_mastered', 100, NULL, 'sentences', 'gold',     50, 3900),
('sentences_150', 'Fluent Footing',  'Master 150 sentences',                         'gem',     'sentences_mastered', 150, NULL, 'sentences', 'gold',     50, 3910),
('sentences_200', 'Two Hundred',     'Master 200 sentences',                         'gem',     'sentences_mastered', 200, NULL, 'sentences', 'gold',     50, 3920),
('sentences_300', 'Three Hundred',   'Master 300 sentences',                         'crown',   'sentences_mastered', 300, NULL, 'sentences', 'platinum', 100, 3930),
('sentences_400', 'Four Hundred',    'Master 400 sentences',                         'crown',   'sentences_mastered', 400, NULL, 'sentences', 'platinum', 100, 3940),
('sentences_500', 'Five Hundred',    'Master 500 sentences',                         'crown',   'sentences_mastered', 500, NULL, 'sentences', 'platinum', 100, 3950),

-- ------------------------------------------------------------------ cards --
('cards_made_5',   'Card Starter',   'Create 5 flashcards',                          'layers',  'flashcards', 5,   NULL, 'cards', 'bronze',   10, 5050),
('cards_made_10',  'Card Builder',   'Create 10 flashcards',                         'layers',  'flashcards', 10,  NULL, 'cards', 'bronze',   10, 5100),
('cards_made_25',  'Card Architect', 'Create 25 flashcards',                         'layers',  'flashcards', 25,  NULL, 'cards', 'silver',   25, 5250),
('cards_made_50',  'Deck Owner',     'Create 50 flashcards',                         'layers',  'flashcards', 50,  NULL, 'cards', 'silver',   25, 5500),
('cards_made_100', 'Card Library',   'Create 100 flashcards',                        'layers',  'flashcards', 100, NULL, 'cards', 'gold',     50, 5900),
('cards_made_200', 'Card Archive',   'Create 200 flashcards',                        'layers',  'flashcards', 200, NULL, 'cards', 'platinum', 100, 5950),
('cards_10',       'Ten Reviews',    'Review 10 flashcards',                         'trophy',  'card_reviews', 10,   NULL, 'cards', 'bronze',   10, 6010),
('cards_25',       'Warm Deck',      'Review 25 flashcards',                         'trophy',  'card_reviews', 25,   NULL, 'cards', 'bronze',   10, 6020),
('cards_100',      'Hundred Reviews','Review 100 flashcards',                        'trophy',  'card_reviews', 100,  NULL, 'cards', 'silver',   25, 6040),
('cards_250',      'Review Machine', 'Review 250 flashcards',                        'trophy',  'card_reviews', 250,  NULL, 'cards', 'gold',     50, 6050),
('cards_500',      'Spaced Master',  'Review 500 flashcards',                        'trophy',  'card_reviews', 500,  NULL, 'cards', 'gold',     50, 6060),
('cards_1000',     'Thousand Club',  'Review 1000 flashcards',                       'crown',   'card_reviews', 1000, NULL, 'cards', 'platinum', 100, 6070),
('verified_1',     'Proven Once',    'Have a card you rated easy confirmed live by Huppy', 'shield', 'cards_verified', 1,   NULL, 'cards', 'bronze',   10, 6510),
('verified_10',    'Proven Ten',     'Have 10 easy-rated cards confirmed live',      'shield',  'cards_verified', 10,  NULL, 'cards', 'silver',   25, 6520),
('verified_25',    'No Bluffing',    'Have 25 easy-rated cards confirmed live',      'shield',  'cards_verified', 25,  NULL, 'cards', 'silver',   25, 6530),
('verified_50',    'Really Knows It','Have 50 easy-rated cards confirmed live',      'shield',  'cards_verified', 50,  NULL, 'cards', 'gold',     50, 6540),
('verified_100',   'Beyond Doubt',   'Have 100 easy-rated cards confirmed live',     'shield',  'cards_verified', 100, NULL, 'cards', 'platinum', 100, 6550),

-- ----------------------------------------------------------- conversation --
('talks_3',    'Three Sessions',  'Hold 3 conversations with Huppy',                 'mic',        'conversations', 3,   NULL, 'conversation', 'bronze',   10, 7030),
('talks_5',    'Five Sessions',   'Hold 5 conversations with Huppy',                 'mic',        'conversations', 5,   NULL, 'conversation', 'bronze',   10, 7050),
('talks_10',   'Regular Speaker', 'Hold 10 conversations with Huppy',                'mic',        'conversations', 10,  NULL, 'conversation', 'silver',   25, 7100),
('talks_25',   'Confident Voice', 'Hold 25 conversations with Huppy',                'mic',        'conversations', 25,  NULL, 'conversation', 'gold',     50, 7250),
('talks_50',   'Natural Talker',  'Hold 50 conversations with Huppy',                'mic',        'conversations', 50,  NULL, 'conversation', 'gold',     50, 7500),
('talks_100',  'Never Silent',    'Hold 100 conversations with Huppy',               'crown',      'conversations', 100, NULL, 'conversation', 'platinum', 100, 7900),
('lines_10',   'Ten Lines',       'Exchange 10 messages with your tutor',            'message-circle', 'messages', 10,   NULL, 'conversation', 'bronze',   10, 7610),
('lines_50',   'Fifty Lines',     'Exchange 50 messages with your tutor',            'message-circle', 'messages', 50,   NULL, 'conversation', 'bronze',   10, 7620),
('lines_100',  'Hundred Lines',   'Exchange 100 messages with your tutor',           'message-circle', 'messages', 100,  NULL, 'conversation', 'silver',   25, 7630),
('lines_250',  'Deep Dialogue',   'Exchange 250 messages with your tutor',           'message-circle', 'messages', 250,  NULL, 'conversation', 'silver',   25, 7640),
('lines_500',  'Long Conversation','Exchange 500 messages with your tutor',          'message-circle', 'messages', 500,  NULL, 'conversation', 'gold',     50, 7650),
('lines_1000', 'Thousand Lines',  'Exchange 1000 messages with your tutor',          'crown',      'messages',      1000, NULL, 'conversation', 'platinum', 100, 7660),

-- ------------------------------------------------------------ corrections --
('fixes_5',   'Five Fixes',       'Take 5 corrections from your tutor',              'sparkles', 'corrections', 5,   NULL, 'corrections', 'bronze',   10, 8050),
('fixes_10',  'Ten Fixes',        'Take 10 corrections from your tutor',             'sparkles', 'corrections', 10,  NULL, 'corrections', 'bronze',   10, 8100),
('fixes_25',  'Coachable',        'Take 25 corrections from your tutor',             'target',   'corrections', 25,  NULL, 'corrections', 'silver',   25, 8250),
('fixes_50',  'Sharp Edges',      'Take 50 corrections from your tutor',             'target',   'corrections', 50,  NULL, 'corrections', 'silver',   25, 8500),
('fixes_100', 'Hundred Fixes',    'Take 100 corrections from your tutor',            'target',   'corrections', 100, NULL, 'corrections', 'gold',     50, 8900),
('fixes_250', 'Precision Speaker','Take 250 corrections from your tutor',            'crown',    'corrections', 250, NULL, 'corrections', 'platinum', 100, 8950),

-- ----------------------------------------------------------------- streak --
('streak_2',   'Back Again',      'Practice 2 days in a row',                        'flame',    'streak_days', 2,   NULL, 'streak', 'bronze',   10, 9010),
('streak_5',   '5-Day Streak',    'Practice 5 days in a row',                        'flame',    'streak_days', 5,   NULL, 'streak', 'bronze',   10, 9030),
('streak_10',  '10-Day Streak',   'Practice 10 days in a row',                       'flame',    'streak_days', 10,  NULL, 'streak', 'silver',   25, 9050),
('streak_14',  'Two Weeks',       'Practice 14 days in a row',                       'flame',    'streak_days', 14,  NULL, 'streak', 'silver',   25, 9060),
('streak_30',  'Full Month',      'Practice 30 days in a row',                       'calendar', 'streak_days', 30,  NULL, 'streak', 'gold',     50, 9080),
('streak_60',  'Two Months',      'Practice 60 days in a row',                       'calendar', 'streak_days', 60,  NULL, 'streak', 'platinum', 100, 9090),
('streak_100', 'Hundred Days',    'Practice 100 days in a row',                      'crown',    'streak_days', 100, NULL, 'streak', 'platinum', 100, 9095),
-- longest_streak, not the current one: this survives a broken streak.
('best_streak_30', 'Record Holder',   'Reach a best streak of 30 days',              'medal',    'longest_streak', 30, NULL, 'streak', 'gold',   50, 9120),

-- --------------------------------------------------------------------- xp --
('xp_100',  'Hundred XP',     'Earn 100 XP',                                         'zap',   'xp', 100,  NULL, 'xp', 'bronze',   10, 9510),
('xp_250',  'Rising Level',   'Earn 250 XP',                                         'zap',   'xp', 250,  NULL, 'xp', 'bronze',   10, 9520),
('xp_500',  'Halfway Up',     'Earn 500 XP',                                         'zap',   'xp', 500,  NULL, 'xp', 'silver',   25, 9530),
('xp_1000', 'Thousand XP',    'Earn 1000 XP',                                        'zap',   'xp', 1000, NULL, 'xp', 'gold',     50, 9540),
('xp_2500', 'Veteran Learner','Earn 2500 XP',                                        'crown', 'xp', 2500, NULL, 'xp', 'platinum', 100, 9550);

-- The service looks badges up by rule; this keeps that scan cheap.
CREATE INDEX idx_badges_metric ON badges (metric);
