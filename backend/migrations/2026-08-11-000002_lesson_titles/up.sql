-- ---------------------------------------------------------------------------
-- Give every lesson a real, planet-specific title and description.
--
-- All 32 lessons were seeded with the same four placeholder rows
-- ("Learn"/"Practice"/"Test"/"Master" + generic descriptions), which the app
-- surfaces verbatim: the chapter-intro screen shows the lesson title as its
-- heading, and the Lessons tab lists every planet's lessons identically. That
-- made the whole course read as placeholder content.
--
-- Each planet keeps the same four-stage arc (learn -> practice -> test ->
-- master) but now names the stage after what the learner actually does on
-- that planet's theme.
-- ---------------------------------------------------------------------------

UPDATE planet_lessons l SET title = v.title, description = v.description
FROM (VALUES
    -- Mercury — First Contacts (greetings, introductions, days & months)
    (1, 1, 'First Words',        'Greetings, names and simple hellos'),
    (1, 2, 'Introduce Yourself', 'Say who you are and where you are from'),
    (1, 3, 'Days & Numbers',     'Recall days, months and counting'),
    (1, 4, 'Meet Someone New',   'Hold a full first-contact conversation'),

    -- Venus — Routine & Actions (work, school, driving, eating)
    (2, 1, 'Everyday Actions',   'Verbs for what you do each day'),
    (2, 2, 'Your Routine',       'Describe your own daily schedule'),
    (2, 3, 'Past & Future',      'Switch between yesterday, today and tomorrow'),
    (2, 4, 'Talk About Your Day','Narrate a full day out loud'),

    -- Earth — Work & Daily Life (help, schedules, problems)
    (3, 1, 'Asking for Help',    'Phrases to request assistance'),
    (3, 2, 'Making Plans',       'Times, schedules and availability'),
    (3, 3, 'Explaining Problems','Describe what went wrong'),
    (3, 4, 'Solve It Together',  'Work through a problem in conversation'),

    -- Mars — Food & Eating (ordering, cooking, groceries)
    (4, 1, 'At the Restaurant',  'Order food and drinks'),
    (4, 2, 'In the Kitchen',     'Cooking and preparing meals'),
    (4, 3, 'Likes & Dislikes',   'State food preferences and needs'),
    (4, 4, 'Order a Full Meal',  'Handle a whole restaurant visit'),

    -- Jupiter — Travel & Getting Around (directions, transport, tickets)
    (5, 1, 'Asking Directions',  'Find your way to a place'),
    (5, 2, 'Public Transport',   'Buses, trains, tickets and times'),
    (5, 3, 'Booking & Tickets',  'Reserve rooms, seats and flights'),
    (5, 4, 'Travel on Your Own', 'Get across a city unaided'),

    -- Saturn — Health & Emotions (doctor, body, feelings)
    (6, 1, 'How You Feel',       'Say when something is wrong'),
    (6, 2, 'At the Doctor',      'Body parts and symptoms'),
    (6, 3, 'Emotions',           'Name moods and feelings'),
    (6, 4, 'Describe & Advise',  'Explain how you feel and give advice'),

    -- Uranus — Work & Business (meetings, emails, calls)
    (7, 1, 'Meetings',           'Schedule and join a meeting'),
    (7, 2, 'Emails & Messages',  'Write and reply professionally'),
    (7, 3, 'Phone Calls',        'Handle a call with confidence'),
    (7, 4, 'Run a Conversation', 'Lead a full business exchange'),

    -- Neptune — Advanced Conversations (opinions, stories, idioms)
    (8, 1, 'Give an Opinion',    'State and support a view'),
    (8, 2, 'Tell a Story',       'Narrate events naturally'),
    (8, 3, 'Idioms',             'Everyday expressions natives use'),
    (8, 4, 'Speak Freely',       'Hold an unscripted conversation')
) AS v(planet_number, position, title, description)
WHERE l.position = v.position
  AND l.planet_id = (SELECT id FROM planets WHERE number = v.planet_number);
