DROP TABLE IF EXISTS planet_lessons;

-- Restore the original 3 thematic planets and drop the added 5.
DELETE FROM planets WHERE number IN (4, 5, 6, 7, 8);

UPDATE planets SET
    title = 'First Contacts',
    subtitle = 'Greetings, introductions, days & months',
    color = '#4A44BE'
WHERE number = 1;

UPDATE planets SET
    title = 'Routine & Actions',
    subtitle = 'Most used verbs, work, school, driving',
    color = '#6C63E0'
WHERE number = 2;

UPDATE planets SET
    title = 'Work & Daily Life',
    subtitle = 'Explaining, asking for help, schedules',
    color = '#8B7DF6'
WHERE number = 3;
