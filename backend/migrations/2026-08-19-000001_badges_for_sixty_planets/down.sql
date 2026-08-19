DELETE FROM badges WHERE code IN (
    'planets_10','planets_15','planets_20','planets_30','planets_40','planets_50','planets_60',
    'lessons_50','lessons_100','lessons_200','lessons_300','lessons_450','lessons_600'
);
UPDATE badges
   SET title = 'Solar System', description = 'Complete every planet in the system'
 WHERE code = 'planets_8';
