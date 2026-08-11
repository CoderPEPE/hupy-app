-- ---------------------------------------------------------------------------
-- Even out the sentence seed.
--
-- Planets 4-8 were seeded with 6 sentences each, but the three original
-- planets were left uneven (Mercury 10, Venus 5, Earth 3). Earth in
-- particular had too few sentences for its four lessons to have distinct
-- material, and the app surfaces "mastered/total sentences" per planet, so
-- the imbalance was visible to the learner as an inconsistent workload.
--
-- Top Venus and Earth up to 6, staying on each planet's stated theme
-- (Venus = routine & actions; Earth = work & daily life).
-- ---------------------------------------------------------------------------

INSERT INTO planet_sentences (planet_id, position, en, pt, subject, verb, complement) VALUES
-- Venus — Routine & Actions (existing: positions 1-5)
('22222222-2222-4222-8222-222222222222', 6, 'She drives to school every morning.', 'Ela dirige para a escola toda manhã.', 'She', 'drives', 'to school every morning'),

-- Earth — Work & Daily Life (existing: positions 1-3)
('33333333-3333-4333-8333-333333333333', 4, 'What time is the meeting?', 'A que horas é a reunião?', 'the meeting', 'is', 'at what time'),
('33333333-3333-4333-8333-333333333333', 5, 'I am busy this afternoon.', 'Estou ocupado esta tarde.', 'I', 'am', 'busy this afternoon'),
('33333333-3333-4333-8333-333333333333', 6, 'Could you send me the details?', 'Você poderia me enviar os detalhes?', 'you', 'could send', 'me the details')
ON CONFLICT DO NOTHING;
