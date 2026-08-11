DELETE FROM planet_sentences
WHERE (planet_id = '22222222-2222-4222-8222-222222222222' AND position = 6)
   OR (planet_id = '33333333-3333-4333-8333-333333333333' AND position IN (4, 5, 6));
