-- ---------------------------------------------------------------------------
-- Repair progress rows whose `mastery` disagrees with its sub-metrics.
--
-- `mastery` is a derived value: it must always equal the average of the six
-- tracked sub-metrics (sentences, pronunciation, conversation, listening,
-- flashcards, review). An earlier build let `mastery` be written directly,
-- which left accounts showing large mastery percentages — and unlocked
-- planets — while every sub-metric was still 0. The app then displayed
-- progress bars for lessons the learner had never done.
--
-- The write path no longer permits this (`bump_progress` rejects any metric
-- outside BUMPABLE_METRICS, and `with_metric` always recomputes the average),
-- so this only needs to clean up the rows the old path left behind.
--
-- Rows already consistent are untouched; this is safe to re-run.
-- ---------------------------------------------------------------------------

UPDATE user_planet_progress
SET mastery = (sentences + pronunciation + conversation + listening + flashcards + review) / 6.0
WHERE abs(
        mastery - (sentences + pronunciation + conversation + listening + flashcards + review) / 6.0
      ) > 0.0001;
