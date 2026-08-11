-- Achievement copy in every supported language.
--
-- The app has exactly three UI languages (en / pt-BR / es, enforced by
-- validate_language), so columns beat a translations table here: no join, and
-- a missing translation is impossible to represent. `title`/`description`
-- remain the English source of truth; the API picks the pair matching the
-- learner's base language.

ALTER TABLE badges
    ADD COLUMN title_pt       VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN description_pt VARCHAR(512) NOT NULL DEFAULT '',
    ADD COLUMN title_es       VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN description_es VARCHAR(512) NOT NULL DEFAULT '';

-- The seven original badges were written in the past tense while the 93 new
-- ones are imperative ("Complete 5 planets"). One voice everywhere.
UPDATE badges SET description = 'Complete your first planet'                            WHERE code = 'planet_1_complete';
UPDATE badges SET description = 'Review 50 flashcards'                                  WHERE code = 'cards_50';
UPDATE badges SET description = 'Create your first flashcard'                           WHERE code = 'first_flashcard';
UPDATE badges SET description = 'Complete your first live conversation with Huppy'      WHERE code = 'first_conversation';
UPDATE badges SET description = 'Receive your first pronunciation or grammar correction' WHERE code = 'first_correction';
UPDATE badges SET description = 'Practice 3 days in a row'                              WHERE code = 'streak_3';
UPDATE badges SET description = 'Practice 7 days in a row'                              WHERE code = 'streak_7';

UPDATE badges SET
    title_pt = t.title_pt, description_pt = t.description_pt,
    title_es = t.title_es, description_es = t.description_es
FROM (VALUES
-- code, title_pt, description_pt, title_es, description_es
('lessons_1',  'Primeiros Passos', 'Conclua sua primeira aula',            'Primeros Pasos',      'Completa tu primera lección'),
('lessons_2',  'Esquentando',      'Conclua 2 aulas',                      'Calentando',          'Completa 2 lecciones'),
('lessons_3',  'Três em Órbita',   'Conclua 3 aulas',                      'Tres en Órbita',      'Completa 3 lecciones'),
('lessons_5',  'Hábito de Estudo', 'Conclua 5 aulas',                      'Hábito de Estudio',   'Completa 5 lecciones'),
('lessons_8',  'Piloto de Curso',  'Conclua 8 aulas',                      'Piloto del Curso',    'Completa 8 lecciones'),
('lessons_12', 'Convés Superior',  'Conclua 12 aulas',                     'Cubierta de Mando',   'Completa 12 lecciones'),
('lessons_16', 'Na Metade',        'Conclua 16 aulas — metade do caminho', 'A Mitad de Camino',   'Completa 16 lecciones — la mitad del camino'),
('lessons_20', 'Vinte Concluídas', 'Conclua 20 aulas',                     'Veinte Completadas',  'Completa 20 lecciones'),
('lessons_24', 'Reta Final',       'Conclua 24 aulas',                     'Recta Final',         'Completa 24 lecciones'),
('lessons_28', 'Quase Tudo',       'Conclua 28 aulas',                     'Casi Todo',           'Completa 28 lecciones'),
('lessons_32', 'Currículo Completo', 'Conclua todas as 32 aulas do curso', 'Currículo Completo',  'Completa las 32 lecciones del curso'),

('planet_1_lessons', 'Estudioso de Mercúrio', 'Conclua as 4 aulas de Mercúrio', 'Erudito de Mercurio', 'Completa las 4 lecciones de Mercurio'),
('planet_2_lessons', 'Estudioso de Vênus',    'Conclua as 4 aulas de Vênus',    'Erudito de Venus',    'Completa las 4 lecciones de Venus'),
('planet_3_lessons', 'Estudioso da Terra',    'Conclua as 4 aulas da Terra',    'Erudito de la Tierra','Completa las 4 lecciones de la Tierra'),
('planet_4_lessons', 'Estudioso de Marte',    'Conclua as 4 aulas de Marte',    'Erudito de Marte',    'Completa las 4 lecciones de Marte'),
('planet_5_lessons', 'Estudioso de Júpiter',  'Conclua as 4 aulas de Júpiter',  'Erudito de Júpiter',  'Completa las 4 lecciones de Júpiter'),
('planet_6_lessons', 'Estudioso de Saturno',  'Conclua as 4 aulas de Saturno',  'Erudito de Saturno',  'Completa las 4 lecciones de Saturno'),
('planet_7_lessons', 'Estudioso de Urano',    'Conclua as 4 aulas de Urano',    'Erudito de Urano',    'Completa las 4 lecciones de Urano'),
('planet_8_lessons', 'Estudioso de Netuno',   'Conclua as 4 aulas de Netuno',   'Erudito de Neptuno',  'Completa las 4 lecciones de Neptuno'),

('planet_2_landing', 'Pouso em Vênus',   'Conclua sua primeira aula em Vênus',   'Aterrizaje en Venus',    'Completa tu primera lección en Venus'),
('planet_3_landing', 'Pouso na Terra',   'Conclua sua primeira aula na Terra',   'Aterrizaje en la Tierra','Completa tu primera lección en la Tierra'),
('planet_4_landing', 'Pouso em Marte',   'Conclua sua primeira aula em Marte',   'Aterrizaje en Marte',    'Completa tu primera lección en Marte'),
('planet_5_landing', 'Pouso em Júpiter', 'Conclua sua primeira aula em Júpiter', 'Aterrizaje en Júpiter',  'Completa tu primera lección en Júpiter'),
('planet_6_landing', 'Pouso em Saturno', 'Conclua sua primeira aula em Saturno', 'Aterrizaje en Saturno',  'Completa tu primera lección en Saturno'),
('planet_7_landing', 'Pouso em Urano',   'Conclua sua primeira aula em Urano',   'Aterrizaje en Urano',    'Completa tu primera lección en Urano'),
('planet_8_landing', 'Pouso em Netuno',  'Conclua sua primeira aula em Netuno',  'Aterrizaje en Neptuno',  'Completa tu primera lección en Neptuno'),

('planet_1_complete', 'Mercúrio Dominado', 'Conclua seu primeiro planeta',              'Mercurio Dominado', 'Completa tu primer planeta'),
('planets_2', 'Dois Mundos',        'Conclua 2 planetas',                              'Dos Mundos',         'Completa 2 planetas'),
('planets_3', 'Sistema Interior',   'Conclua 3 planetas',                              'Sistema Interior',   'Completa 3 planetas'),
('planets_4', 'Quatro Concluídos',  'Conclua 4 planetas',                              'Cuatro Completados', 'Completa 4 planetas'),
('planets_5', 'Gigante Gasoso',     'Conclua 5 planetas',                              'Gigante Gaseoso',    'Completa 5 planetas'),
('planets_6', 'Mundo dos Anéis',    'Conclua 6 planetas',                              'Mundo de Anillos',   'Completa 6 planetas'),
('planets_7', 'Confins do Sistema', 'Conclua 7 planetas',                              'Confines del Sistema','Completa 7 planetas'),
('planets_8', 'Sistema Solar',      'Conclua todos os planetas do sistema',            'Sistema Solar',      'Completa todos los planetas del sistema'),

('sentences_1',   'Primeira Frase',  'Domine sua primeira frase', 'Primera Frase',   'Domina tu primera frase'),
('sentences_5',   'Cinco Frases',    'Domine 5 frases',           'Cinco Frases',    'Domina 5 frases'),
('sentences_10',  'Dez Frases',      'Domine 10 frases',          'Diez Frases',     'Domina 10 frases'),
('sentences_25',  'Livro de Frases', 'Domine 25 frases',          'Libro de Frases', 'Domina 25 frases'),
('sentences_50',  'Cinquenta Frases','Domine 50 frases',          'Cincuenta Frases','Domina 50 frases'),
('sentences_75',  'Setenta e Cinco', 'Domine 75 frases',          'Setenta y Cinco', 'Domina 75 frases'),
('sentences_100', 'Centena',         'Domine 100 frases',         'Centena',         'Domina 100 frases'),
('sentences_150', 'Base Fluente',    'Domine 150 frases',         'Base Fluida',     'Domina 150 frases'),
('sentences_200', 'Duzentas',        'Domine 200 frases',         'Doscientas',      'Domina 200 frases'),
('sentences_300', 'Trezentas',       'Domine 300 frases',         'Trescientas',     'Domina 300 frases'),
('sentences_400', 'Quatrocentas',    'Domine 400 frases',         'Cuatrocientas',   'Domina 400 frases'),
('sentences_500', 'Quinhentas',      'Domine 500 frases',         'Quinientas',      'Domina 500 frases'),

('first_flashcard', 'Colecionador de Cartões', 'Crie seu primeiro cartão', 'Coleccionista de Tarjetas', 'Crea tu primera tarjeta'),
('cards_made_5',   'Início da Coleção',       'Crie 5 cartões',   'Primeras Tarjetas',        'Crea 5 tarjetas'),
('cards_made_10',  'Construtor de Cartões',   'Crie 10 cartões',  'Constructor de Tarjetas',  'Crea 10 tarjetas'),
('cards_made_25',  'Arquiteto de Cartões',    'Crie 25 cartões',  'Arquitecto de Tarjetas',   'Crea 25 tarjetas'),
('cards_made_50',  'Dono do Baralho',         'Crie 50 cartões',  'Dueño del Mazo',           'Crea 50 tarjetas'),
('cards_made_100', 'Biblioteca de Cartões',   'Crie 100 cartões', 'Biblioteca de Tarjetas',   'Crea 100 tarjetas'),
('cards_made_200', 'Arquivo de Cartões',      'Crie 200 cartões', 'Archivo de Tarjetas',      'Crea 200 tarjetas'),
('cards_10',   'Dez Revisões',          'Revise 10 cartões',   'Diez Repasos',        'Repasa 10 tarjetas'),
('cards_25',   'Baralho Aquecido',      'Revise 25 cartões',   'Mazo Caliente',       'Repasa 25 tarjetas'),
('cards_50',   'Cinquenta Cartões',     'Revise 50 cartões',   'Cincuenta Tarjetas',  'Repasa 50 tarjetas'),
('cards_100',  'Cem Revisões',          'Revise 100 cartões',  'Cien Repasos',        'Repasa 100 tarjetas'),
('cards_250',  'Máquina de Revisão',    'Revise 250 cartões',  'Máquina de Repaso',   'Repasa 250 tarjetas'),
('cards_500',  'Mestre da Repetição',   'Revise 500 cartões',  'Maestro del Repaso',  'Repasa 500 tarjetas'),
('cards_1000', 'Clube dos Mil',         'Revise 1000 cartões', 'Club de los Mil',     'Repasa 1000 tarjetas'),
('verified_1',   'Provado Uma Vez',   'Tenha um cartão marcado como fácil confirmado ao vivo pelo Huppy', 'Probado Una Vez',    'Ten una tarjeta marcada como fácil confirmada en vivo por Huppy'),
('verified_10',  'Provado Dez Vezes', 'Tenha 10 cartões fáceis confirmados ao vivo',                     'Probado Diez Veces', 'Ten 10 tarjetas fáciles confirmadas en vivo'),
('verified_25',  'Sem Blefe',         'Tenha 25 cartões fáceis confirmados ao vivo',                     'Sin Farolear',       'Ten 25 tarjetas fáciles confirmadas en vivo'),
('verified_50',  'Sabe de Verdade',   'Tenha 50 cartões fáceis confirmados ao vivo',                     'Lo Sabe de Verdad',  'Ten 50 tarjetas fáciles confirmadas en vivo'),
('verified_100', 'Sem Dúvida',        'Tenha 100 cartões fáceis confirmados ao vivo',                    'Sin Ninguna Duda',   'Ten 100 tarjetas fáciles confirmadas en vivo'),

('first_conversation', 'Primeiro Contato', 'Complete sua primeira conversa ao vivo com o Huppy', 'Primer Contacto', 'Completa tu primera conversación en vivo con Huppy'),
('talks_3',   'Três Sessões',      'Tenha 3 conversas com o Huppy',   'Tres Sesiones',     'Ten 3 conversaciones con Huppy'),
('talks_5',   'Cinco Sessões',     'Tenha 5 conversas com o Huppy',   'Cinco Sesiones',    'Ten 5 conversaciones con Huppy'),
('talks_10',  'Falante Assíduo',   'Tenha 10 conversas com o Huppy',  'Hablante Habitual', 'Ten 10 conversaciones con Huppy'),
('talks_25',  'Voz Confiante',     'Tenha 25 conversas com o Huppy',  'Voz Segura',        'Ten 25 conversaciones con Huppy'),
('talks_50',  'Papo Natural',      'Tenha 50 conversas com o Huppy',  'Charla Natural',    'Ten 50 conversaciones con Huppy'),
('talks_100', 'Nunca em Silêncio', 'Tenha 100 conversas com o Huppy', 'Nunca en Silencio', 'Ten 100 conversaciones con Huppy'),
('lines_10',   'Dez Falas',        'Troque 10 mensagens com seu tutor',   'Diez Líneas',        'Intercambia 10 mensajes con tu tutor'),
('lines_50',   'Cinquenta Falas',  'Troque 50 mensagens com seu tutor',   'Cincuenta Líneas',   'Intercambia 50 mensajes con tu tutor'),
('lines_100',  'Cem Falas',        'Troque 100 mensagens com seu tutor',  'Cien Líneas',        'Intercambia 100 mensajes con tu tutor'),
('lines_250',  'Diálogo Profundo', 'Troque 250 mensagens com seu tutor',  'Diálogo Profundo',   'Intercambia 250 mensajes con tu tutor'),
('lines_500',  'Conversa Longa',   'Troque 500 mensagens com seu tutor',  'Conversación Larga', 'Intercambia 500 mensajes con tu tutor'),
('lines_1000', 'Mil Falas',        'Troque 1000 mensagens com seu tutor', 'Mil Líneas',         'Intercambia 1000 mensajes con tu tutor'),

('first_correction', 'Primeira Correção', 'Receba sua primeira correção de pronúncia ou gramática', 'Primera Corrección', 'Recibe tu primera corrección de pronunciación o gramática'),
('fixes_5',   'Cinco Correções',    'Receba 5 correções do seu tutor',   'Cinco Correcciones', 'Recibe 5 correcciones de tu tutor'),
('fixes_10',  'Dez Correções',      'Receba 10 correções do seu tutor',  'Diez Correcciones',  'Recibe 10 correcciones de tu tutor'),
('fixes_25',  'Aberto a Aprender',  'Receba 25 correções do seu tutor',  'Abierto a Aprender', 'Recibe 25 correcciones de tu tutor'),
('fixes_50',  'Lapidando Arestas',  'Receba 50 correções do seu tutor',  'Puliendo Detalles',  'Recibe 50 correcciones de tu tutor'),
('fixes_100', 'Cem Correções',      'Receba 100 correções do seu tutor', 'Cien Correcciones',  'Recibe 100 correcciones de tu tutor'),
('fixes_250', 'Fala Precisa',       'Receba 250 correções do seu tutor', 'Habla Precisa',      'Recibe 250 correcciones de tu tutor'),

('streak_2',   'De Volta',              'Pratique 2 dias seguidos',   'De Vuelta',        'Practica 2 días seguidos'),
('streak_3',   'Sequência de 3 Dias',   'Pratique 3 dias seguidos',   'Racha de 3 Días',  'Practica 3 días seguidos'),
('streak_5',   'Sequência de 5 Dias',   'Pratique 5 dias seguidos',   'Racha de 5 Días',  'Practica 5 días seguidos'),
('streak_7',   'Sequência de 7 Dias',   'Pratique 7 dias seguidos',   'Racha de 7 Días',  'Practica 7 días seguidos'),
('streak_10',  'Sequência de 10 Dias',  'Pratique 10 dias seguidos',  'Racha de 10 Días', 'Practica 10 días seguidos'),
('streak_14',  'Duas Semanas',          'Pratique 14 dias seguidos',  'Dos Semanas',      'Practica 14 días seguidos'),
('streak_30',  'Mês Completo',          'Pratique 30 dias seguidos',  'Mes Completo',     'Practica 30 días seguidos'),
('streak_60',  'Dois Meses',            'Pratique 60 dias seguidos',  'Dos Meses',        'Practica 60 días seguidos'),
('streak_100', 'Cem Dias',              'Pratique 100 dias seguidos', 'Cien Días',        'Practica 100 días seguidos'),
('best_streak_30', 'Recordista',        'Alcance um recorde de 30 dias', 'Recordista',    'Alcanza un récord de 30 días'),

('xp_100',  'Cem XP',            'Ganhe 100 XP',  'Cien XP',            'Gana 100 XP'),
('xp_250',  'Subindo de Nível',  'Ganhe 250 XP',  'Subiendo de Nivel',  'Gana 250 XP'),
('xp_500',  'Meio Caminho',      'Ganhe 500 XP',  'A Medio Camino',     'Gana 500 XP'),
('xp_1000', 'Mil XP',            'Ganhe 1000 XP', 'Mil XP',             'Gana 1000 XP'),
('xp_2500', 'Aluno Veterano',    'Ganhe 2500 XP', 'Alumno Veterano',    'Gana 2500 XP')
) AS t(code, title_pt, description_pt, title_es, description_es)
WHERE badges.code = t.code;
