-- Keep the seven original badges (and anything users already earned); drop
-- only what this migration added.
DELETE FROM badges WHERE code NOT IN (
    'first_correction', 'first_flashcard', 'first_conversation',
    'streak_3', 'streak_7', 'planet_1_complete', 'cards_50'
);

DROP INDEX IF EXISTS idx_badges_metric;

ALTER TABLE badges
    DROP COLUMN metric,
    DROP COLUMN threshold,
    DROP COLUMN scope,
    DROP COLUMN category,
    DROP COLUMN tier,
    DROP COLUMN xp_reward,
    DROP COLUMN sort_order;
