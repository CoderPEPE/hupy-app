-- ---------------------------------------------------------------------------
-- Multi-language courses.
--
-- The app previously taught a single course: English to Portuguese speakers
-- (one planet set, sentence rows carrying `en` target + `pt` base text).
-- This migration turns that into three parallel courses, one per target
-- language, each with its own duplicate planet set (per the chosen layout):
--
--   language 'en'  -> English course   (base: pt)   — the existing planets
--   language 'es'  -> Spanish course   (base: pt)   — new e-prefixed planets
--   language 'pt'  -> Portuguese course(base: en)   — new f-prefixed planets
--
-- Every sentence row stores its target text in the matching column
-- (en / es / pt) and its base-language translation in the other slot
-- (en course: en+pt; es course: es+pt; pt course: pt+en). The server picks
-- the columns to expose from the planet's `language`.
--
-- `users.language` records which course the learner chose, so planet lists,
-- the active planet for the live tutor, and catalog counts can be filtered
-- to the user's course.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Schema: planets.language, users.language, planet_sentences.es
-- ---------------------------------------------------------------------------

ALTER TABLE planets
    ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en';

-- `number` used to be globally unique; now uniqueness is per course.
ALTER TABLE planets DROP CONSTRAINT planets_number_key;
ALTER TABLE planets ADD CONSTRAINT planets_language_number_key UNIQUE (language, number);

ALTER TABLE users
    ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en';

-- Spanish target text (empty for the en/pt courses, which don't use it).
ALTER TABLE planet_sentences
    ADD COLUMN es VARCHAR(512) NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 2. Existing planets are the English course.
-- ---------------------------------------------------------------------------

UPDATE planets SET language = 'en';

-- ---------------------------------------------------------------------------
-- 3. Spanish course — planets (Mercury..Neptune, same order/colors).
-- ---------------------------------------------------------------------------

INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery, language) VALUES
('e1111111-1111-4111-8111-111111111111', 1, 'Mercury',
 'Primeros Contactos — saludos, presentaciones, días y meses', '#9CA3AF',
 '["Saludos","Presentaciones personales","Preguntar y responder cómo estás","Despedidas","Días de la semana","Meses y estaciones","Horas y partes del día","Frases sociales básicas"]'::jsonb,
 0.8, 'es'),
('e2222222-2222-4222-8222-222222222222', 2, 'Venus',
 'Rutina y Acciones — trabajo, escuela, conducir, comer', '#E8B64C',
 '["Verbos más usados","Ir al trabajo / a la escuela","Conducir","Comer y beber","Necesitar y querer","Hacer / preparar / arreglar","Frases de rutina comunes"]'::jsonb,
 0.8, 'es'),
('e3333333-3333-4333-8333-333333333333', 3, 'Earth',
 'Trabajo y Vida Diaria — ayuda, horarios, problemas', '#4A90D9',
 '["Explicar lo que hago","Pedir ayuda","Reportar problemas","Hablar de horarios","Coordinar tareas","Describir eventos"]'::jsonb,
 0.8, 'es'),
('e4444444-4444-4444-8444-444444444444', 4, 'Mars',
 'Comida y Alimentación — pedir, cocinar, comprar', '#E2574C',
 '["Restaurante y pedidos","Cocinar en casa","Compras y supermercado","Preferencias de comida","Comidas del día"]'::jsonb,
 0.8, 'es'),
('e5555555-5555-4555-8555-555555555555', 5, 'Jupiter',
 'Viajes y Desplazamientos — direcciones, transporte, billetes', '#D19A66',
 '["Pedir direcciones","Transporte público","Reservas y billetes","En el aeropuerto","Preguntas de viaje"]'::jsonb,
 0.8, 'es'),
('e6666666-6666-4666-8666-666666666666', 6, 'Saturn',
 'Salud y Emociones — médico, cuerpo, sentimientos', '#E0C068',
 '["Sentirse mal","En el médico","Partes del cuerpo","Emociones y sentimientos","Dar consejos"]'::jsonb,
 0.8, 'es'),
('e7777777-7777-4777-8777-777777777777', 7, 'Uranus',
 'Trabajo y Negocios — reuniones, correos, llamadas', '#6FC7C9',
 '["Reuniones","Correos y mensajes","Llamadas telefónicas","Charla profesional","Trabajos y tareas"]'::jsonb,
 0.8, 'es'),
('e8888888-8888-4888-8888-888888888888', 8, 'Neptune',
 'Conversaciones Avanzadas — opiniones, historias, expresiones', '#4A63D9',
 '["Opiniones y argumentos","Contar historias","Hipótesis","Modismos y expresiones","Fluidez natural"]'::jsonb,
 0.8, 'es');

-- ---------------------------------------------------------------------------
-- 4. Portuguese course — planets (English-speaking learners, base: en).
-- ---------------------------------------------------------------------------

INSERT INTO planets (id, number, title, subtitle, color, topics, unlock_mastery, language) VALUES
('f1111111-1111-4111-8111-111111111111', 1, 'Mercury',
 'Primeiros Contatos — cumprimentos, apresentações, dias e meses', '#9CA3AF',
 '["Cumprimentos","Apresentações pessoais","Perguntar e responder como você está","Despedidas","Dias da semana","Meses e estações","Horas e partes do dia","Frases sociais básicas"]'::jsonb,
 0.8, 'pt'),
('f2222222-2222-4222-8222-222222222222', 2, 'Venus',
 'Rotina e Ações — trabalho, escola, dirigir, comer', '#E8B64C',
 '["Verbos mais usados","Ir ao trabalho / à escola","Dirigir","Comer e beber","Precisar e querer","Fazer / preparar / consertar","Frases de rotina comuns"]'::jsonb,
 0.8, 'pt'),
('f3333333-3333-4333-8333-333333333333', 3, 'Earth',
 'Trabalho e Vida Diária — ajuda, horários, problemas', '#4A90D9',
 '["Explicar o que estou fazendo","Pedir ajuda","Reportar problemas","Falar sobre horários","Coordenar tarefas","Descrever eventos"]'::jsonb,
 0.8, 'pt'),
('f4444444-4444-4444-8444-444444444444', 4, 'Mars',
 'Comida e Alimentação — pedir, cozinhar, compras', '#E2574C',
 '["Restaurante e pedidos","Cozinhar em casa","Compras e supermercado","Preferências alimentares","Refeições do dia"]'::jsonb,
 0.8, 'pt'),
('f5555555-5555-4555-8555-555555555555', 5, 'Jupiter',
 'Viagens e Deslocamentos — direções, transporte, bilhetes', '#D19A66',
 '["Pedir direções","Transporte público","Reservas e bilhetes","No aeroporto","Perguntas de viagem"]'::jsonb,
 0.8, 'pt'),
('f6666666-6666-4666-8666-666666666666', 6, 'Saturn',
 'Saúde e Emoções — médico, corpo, sentimentos', '#E0C068',
 '["Sentir-se mal","No médico","Partes do corpo","Emoções e sentimentos","Dar conselhos"]'::jsonb,
 0.8, 'pt'),
('f7777777-7777-4777-8777-777777777777', 7, 'Uranus',
 'Trabalho e Negócios — reuniões, e-mails, ligações', '#6FC7C9',
 '["Reuniões","E-mails e mensagens","Ligações","Conversa profissional","Trabalhos e tarefas"]'::jsonb,
 0.8, 'pt'),
('f8888888-8888-4888-8888-888888888888', 8, 'Neptune',
 'Conversas Avançadas — opiniões, histórias, expressões', '#4A63D9',
 '["Opiniões e argumentos","Contar histórias","Hipóteses","Expressões idiomáticas","Fluência natural"]'::jsonb,
 0.8, 'pt');

-- ---------------------------------------------------------------------------
-- 5. Spanish course — sentences (es = target, pt = base translation).
--    Structure fields (subject/verb/complement) describe the Spanish sentence.
-- ---------------------------------------------------------------------------

INSERT INTO planet_sentences (planet_id, position, en, es, pt, subject, verb, complement) VALUES
-- Mercury — Primeros Contactos
('e1111111-1111-4111-8111-111111111111', 1, '', 'Buenos días', 'Bom dia', '', '', 'Buenos días'),
('e1111111-1111-4111-8111-111111111111', 2, '', 'Buenas tardes', 'Boa tarde', '', '', 'Buenas tardes'),
('e1111111-1111-4111-8111-111111111111', 3, '', 'Buenas noches', 'Boa noite (ao chegar)', '', '', 'Buenas noches'),
('e1111111-1111-4111-8111-111111111111', 4, '', 'Hola, ¿cómo estás?', 'Olá, como você está?', 'tú', 'estás', 'cómo'),
('e1111111-1111-4111-8111-111111111111', 5, '', 'Estoy bien, gracias. ¿Y tú?', 'Estou bem, obrigado. E você?', 'yo', 'estoy', 'bien, gracias'),
('e1111111-1111-4111-8111-111111111111', 6, '', 'Mucho gusto', 'Prazer em conhecê-lo', '', '', 'Mucho gusto'),
('e1111111-1111-4111-8111-111111111111', 7, '', '¿Cómo te llamas?', 'Qual é o seu nome?', 'te', 'llamas', 'cómo'),
('e1111111-1111-4111-8111-111111111111', 8, '', 'Soy de Brasil', 'Eu sou do Brasil', 'yo', 'soy', 'de Brasil'),
('e1111111-1111-4111-8111-111111111111', 9, '', 'Adiós, hasta mañana', 'Adeus, até amanhã', '', '', 'Adiós, hasta mañana'),
('e1111111-1111-4111-8111-111111111111', 10, '', 'Hoy es lunes', 'Hoje é segunda-feira', 'hoy', 'es', 'lunes'),
-- Venus — Rutina y Acciones
('e2222222-2222-4222-8222-222222222222', 1, '', 'Trabajo todos los días', 'Eu trabalho todos os dias', 'yo', 'trabajo', 'todos los días'),
('e2222222-2222-4222-8222-222222222222', 2, '', 'Trabajé ayer', 'Eu trabalhei ontem', 'yo', 'trabajé', 'ayer'),
('e2222222-2222-4222-8222-222222222222', 3, '', 'Trabajaré mañana', 'Eu vou trabalhar amanhã', 'yo', 'trabajaré', 'mañana'),
('e2222222-2222-4222-8222-222222222222', 4, '', 'No trabajo los domingos', 'Eu não trabalho aos domingos', 'yo', 'no trabajo', 'los domingos'),
('e2222222-2222-4222-8222-222222222222', 5, '', '¿Trabajas aquí?', 'Você trabalha aqui?', 'tú', 'trabajas', 'aquí'),
('e2222222-2222-4222-8222-222222222222', 6, '', 'Ella conduce a la escuela cada mañana', 'Ela dirige para a escola toda manhã', 'ella', 'conduce', 'a la escuela cada mañana'),
-- Earth — Trabajo y Vida Diaria
('e3333333-3333-4333-8333-333333333333', 1, '', 'Necesito ayuda', 'Eu preciso de ajuda', 'yo', 'necesito', 'ayuda'),
('e3333333-3333-4333-8333-333333333333', 2, '', '¿Puedes ayudarme, por favor?', 'Você pode me ajudar, por favor?', 'tú', 'puedes ayudar', 'me'),
('e3333333-3333-4333-8333-333333333333', 3, '', 'Hay un problema con mi computadora', 'Há um problema com o meu computador', 'Hay', '', 'un problema con mi computadora'),
('e3333333-3333-4333-8333-333333333333', 4, '', '¿A qué hora es la reunión?', 'A que horas é a reunião?', 'la reunión', 'es', 'a qué hora'),
('e3333333-3333-4333-8333-333333333333', 5, '', 'Estoy ocupado esta tarde', 'Estou ocupado esta tarde', 'yo', 'estoy', 'ocupado esta tarde'),
('e3333333-3333-4333-8333-333333333333', 6, '', '¿Podrías enviarme los detalles?', 'Você poderia me enviar os detalhes?', 'tú', 'podrías enviar', 'me los detalles'),
-- Mars — Comida y Alimentación
('e4444444-4444-4444-8444-444444444444', 1, '', 'Me gustaría pedir una pizza, por favor', 'Eu gostaria de pedir uma pizza, por favor.', 'yo', 'me gustaría', 'pedir una pizza'),
('e4444444-4444-4444-8444-444444444444', 2, '', 'La comida está deliciosa', 'A comida está deliciosa.', 'la comida', 'está', 'deliciosa'),
('e4444444-4444-4444-8444-444444444444', 3, '', '¿Puedo ver el menú, por favor?', 'Posso ver o cardápio, por favor?', 'yo', 'puedo ver', 'el menú'),
('e4444444-4444-4444-8444-444444444444', 4, '', 'No como carne', 'Eu não como carne.', 'yo', 'no como', 'carne'),
('e4444444-4444-4444-8444-444444444444', 5, '', 'Cocinemos la cena juntos', 'Vamos cozinhar o jantar juntos.', 'nosotros', 'cocinemos', 'la cena juntos'),
('e4444444-4444-4444-8444-444444444444', 6, '', 'Tengo sed', 'Estou com sede.', 'yo', 'tengo', 'sed'),
-- Jupiter — Viajes y Desplazamientos
('e5555555-5555-4555-8555-555555555555', 1, '', 'Disculpe, ¿dónde está la estación de tren?', 'Com licença, onde fica a estação de trem?', 'la estación de tren', 'está', 'dónde'),
('e5555555-5555-4555-8555-555555555555', 2, '', '¿Cuánto cuesta un billete al centro de la ciudad?', 'Quanto custa uma passagem para o centro da cidade?', 'un billete', 'cuesta', 'cuánto'),
('e5555555-5555-4555-8555-555555555555', 3, '', 'Necesito reservar una habitación de hotel', 'Eu preciso reservar um quarto de hotel.', 'yo', 'necesito', 'reservar una habitación de hotel'),
('e5555555-5555-4555-8555-555555555555', 4, '', 'El autobús llega tarde hoy', 'O ônibus está atrasado hoje.', 'el autobús', 'llega', 'tarde hoy'),
('e5555555-5555-4555-8555-555555555555', 5, '', 'Mañana volamos a Londres', 'Nós vamos voar para Londres amanhã.', 'nosotros', 'volamos', 'a Londres mañana'),
('e5555555-5555-4555-8555-555555555555', 6, '', 'Gira a la izquierda en el semáforo', 'Vire à esquerda no semáforo.', 'tú', 'gira', 'a la izquierda en el semáforo'),
-- Saturn — Salud y Emociones
('e6666666-6666-4666-8666-666666666666', 1, '', 'Hoy no me siento bien', 'Não estou me sentindo bem hoje.', 'yo', 'no me siento', 'bien hoy'),
('e6666666-6666-4666-8666-666666666666', 2, '', 'Me duele la cabeza', 'Minha cabeça dói.', 'me', 'duele', 'la cabeza'),
('e6666666-6666-4666-8666-666666666666', 3, '', 'Deberías ver a un médico', 'Você deveria consultar um médico.', 'tú', 'deberías ver', 'a un médico'),
('e6666666-6666-4666-8666-666666666666', 4, '', 'Estoy cansado y estresado', 'Estou cansado e estressado.', 'yo', 'estoy', 'cansado y estresado'),
('e6666666-6666-4666-8666-666666666666', 5, '', '¿Te sientes mejor ahora?', 'Você está se sentindo melhor agora?', 'tú', 'te sientes', 'mejor ahora'),
('e6666666-6666-4666-8666-666666666666', 6, '', 'Toma esta medicina dos veces al día', 'Tome este remédio duas vezes ao dia.', 'tú', 'toma', 'esta medicina dos veces al día'),
-- Uranus — Trabajo y Negocios
('e7777777-7777-4777-8777-777777777777', 1, '', '¿Podemos agendar una reunión para el lunes?', 'Podemos agendar uma reunião para segunda-feira?', 'nosotros', 'podemos agendar', 'una reunión para el lunes'),
('e7777777-7777-4777-8777-777777777777', 2, '', 'Te enviaré el informe por correo electrónico', 'Vou enviar o relatório por e-mail.', 'yo', 'te enviaré', 'el informe por correo electrónico'),
('e7777777-7777-4777-8777-777777777777', 3, '', '¿Podrías llamarme más tarde?', 'Você poderia me ligar de volta mais tarde?', 'tú', 'podrías llamar', 'me más tarde'),
('e7777777-7777-4777-8777-777777777777', 4, '', 'Necesitamos terminar el proyecto para el viernes', 'Precisamos terminar o projeto até sexta-feira.', 'nosotros', 'necesitamos', 'terminar el proyecto para el viernes'),
('e7777777-7777-4777-8777-777777777777', 5, '', 'Trabajo en ventas', 'Eu trabalho em vendas.', 'yo', 'trabajo', 'en ventas'),
('e7777777-7777-4777-8777-777777777777', 6, '', 'Discutamos esto en la reunión', 'Vamos discutir isso na reunião.', 'nosotros', 'discutamos', 'esto en la reunión'),
-- Neptune — Conversaciones Avanzadas
('e8888888-8888-4888-8888-888888888888', 1, '', 'En mi opinión, esta es una gran idea', 'Na minha opinião, esta é uma ótima ideia.', 'esta', 'es', 'una gran idea'),
('e8888888-8888-4888-8888-888888888888', 2, '', 'Si tuviera más tiempo, viajaría más', 'Se eu tivesse mais tempo, viajaria mais.', 'yo', 'viajaría', 'más'),
('e8888888-8888-4888-8888-888888888888', 3, '', '¡Es pan comido!', 'É moleza!', 'Es', '', 'pan comido'),
('e8888888-8888-4888-8888-888888888888', 4, '', 'No puedo esperar para verte', 'Mal posso esperar para te ver.', 'yo', 'no puedo esperar', 'para verte'),
('e8888888-8888-4888-8888-888888888888', 5, '', 'Cuéntame una historia sobre tu infancia', 'Conte-me uma história sobre sua infância.', 'tú', 'cuéntame', 'una historia sobre tu infancia'),
('e8888888-8888-4888-8888-888888888888', 6, '', 'Ella tiene mucha experiencia', 'Ela tem muita experiência.', 'ella', 'tiene', 'mucha experiencia');

-- ---------------------------------------------------------------------------
-- 6. Portuguese course — sentences (pt = target, en = base translation).
--    Structure fields describe the Portuguese sentence.
-- ---------------------------------------------------------------------------

INSERT INTO planet_sentences (planet_id, position, en, es, pt, subject, verb, complement) VALUES
-- Mercury — Primeiros Contatos
('f1111111-1111-4111-8111-111111111111', 1, 'Good morning', '', 'Bom dia', '', '', 'Bom dia'),
('f1111111-1111-4111-8111-111111111111', 2, 'Good afternoon', '', 'Boa tarde', '', '', 'Boa tarde'),
('f1111111-1111-4111-8111-111111111111', 3, 'Good evening', '', 'Boa noite', '', '', 'Boa noite'),
('f1111111-1111-4111-8111-111111111111', 4, 'Hello, how are you?', '', 'Olá, como você está?', 'você', 'está', 'como'),
('f1111111-1111-4111-8111-111111111111', 5, 'I''m fine, thank you. And you?', '', 'Estou bem, obrigado. E você?', 'eu', 'estou', 'bem, obrigado'),
('f1111111-1111-4111-8111-111111111111', 6, 'Nice to meet you', '', 'Prazer em conhecê-lo', '', '', 'Prazer em conhecê-lo'),
('f1111111-1111-4111-8111-111111111111', 7, 'What is your name?', '', 'Qual é o seu nome?', 'o seu nome', 'é', 'qual'),
('f1111111-1111-4111-8111-111111111111', 8, 'I am from Brazil', '', 'Eu sou do Brasil', 'eu', 'sou', 'do Brasil'),
('f1111111-1111-4111-8111-111111111111', 9, 'Goodbye, see you tomorrow', '', 'Adeus, até amanhã', '', '', 'Adeus, até amanhã'),
('f1111111-1111-4111-8111-111111111111', 10, 'Today is Monday', '', 'Hoje é segunda-feira', 'hoje', 'é', 'segunda-feira'),
-- Venus — Rotina e Ações
('f2222222-2222-4222-8222-222222222222', 1, 'I work every day', '', 'Eu trabalho todos os dias', 'eu', 'trabalho', 'todos os dias'),
('f2222222-2222-4222-8222-222222222222', 2, 'I worked yesterday', '', 'Eu trabalhei ontem', 'eu', 'trabalhei', 'ontem'),
('f2222222-2222-4222-8222-222222222222', 3, 'I will work tomorrow', '', 'Eu vou trabalhar amanhã', 'eu', 'vou trabalhar', 'amanhã'),
('f2222222-2222-4222-8222-222222222222', 4, 'I don''t work on Sundays', '', 'Eu não trabalho aos domingos', 'eu', 'não trabalho', 'aos domingos'),
('f2222222-2222-4222-8222-222222222222', 5, 'Do you work here?', '', 'Você trabalha aqui?', 'você', 'trabalha', 'aqui'),
('f2222222-2222-4222-8222-222222222222', 6, 'She drives to school every morning', '', 'Ela dirige para a escola toda manhã', 'ela', 'dirige', 'para a escola toda manhã'),
-- Earth — Trabalho e Vida Diária
('f3333333-3333-4333-8333-333333333333', 1, 'I need help', '', 'Eu preciso de ajuda', 'eu', 'preciso', 'de ajuda'),
('f3333333-3333-4333-8333-333333333333', 2, 'Can you help me, please?', '', 'Você pode me ajudar, por favor?', 'você', 'pode ajudar', 'me'),
('f3333333-3333-4333-8333-333333333333', 3, 'There is a problem with my computer', '', 'Há um problema com o meu computador', 'Há', '', 'um problema com o meu computador'),
('f3333333-3333-4333-8333-333333333333', 4, 'What time is the meeting?', '', 'A que horas é a reunião?', 'a reunião', 'é', 'a que horas'),
('f3333333-3333-4333-8333-333333333333', 5, 'I am busy this afternoon', '', 'Estou ocupado esta tarde', 'eu', 'estou', 'ocupado esta tarde'),
('f3333333-3333-4333-8333-333333333333', 6, 'Could you send me the details?', '', 'Você poderia me enviar os detalhes?', 'você', 'poderia enviar', 'me os detalhes'),
-- Mars — Comida e Alimentação
('f4444444-4444-4444-8444-444444444444', 1, 'I would like to order a pizza, please.', '', 'Eu gostaria de pedir uma pizza, por favor.', 'eu', 'gostaria', 'de pedir uma pizza'),
('f4444444-4444-4444-8444-444444444444', 2, 'The food is delicious.', '', 'A comida está deliciosa.', 'a comida', 'está', 'deliciosa'),
('f4444444-4444-4444-8444-444444444444', 3, 'Can I have the menu, please?', '', 'Posso ver o cardápio, por favor?', 'eu', 'posso ver', 'o cardápio'),
('f4444444-4444-4444-8444-444444444444', 4, 'I don''t eat meat.', '', 'Eu não como carne.', 'eu', 'não como', 'carne'),
('f4444444-4444-4444-8444-444444444444', 5, 'Let''s cook dinner together.', '', 'Vamos cozinhar o jantar juntos.', 'vamos', 'cozinhar', 'o jantar juntos'),
('f4444444-4444-4444-8444-444444444444', 6, 'I''m thirsty.', '', 'Estou com sede.', 'eu', 'estou', 'com sede'),
-- Jupiter — Viagens e Deslocamentos
('f5555555-5555-4555-8555-555555555555', 1, 'Excuse me, where is the train station?', '', 'Com licença, onde fica a estação de trem?', 'a estação de trem', 'fica', 'onde'),
('f5555555-5555-4555-8555-555555555555', 2, 'How much is a ticket to the city center?', '', 'Quanto custa uma passagem para o centro da cidade?', 'uma passagem', 'custa', 'quanto'),
('f5555555-5555-4555-8555-555555555555', 3, 'I need to book a hotel room.', '', 'Eu preciso reservar um quarto de hotel.', 'eu', 'preciso', 'reservar um quarto de hotel'),
('f5555555-5555-4555-8555-555555555555', 4, 'The bus is late today.', '', 'O ônibus está atrasado hoje.', 'o ônibus', 'está', 'atrasado hoje'),
('f5555555-5555-4555-8555-555555555555', 5, 'We are flying to London tomorrow.', '', 'Nós vamos voar para Londres amanhã.', 'nós', 'vamos voar', 'para Londres amanhã'),
('f5555555-5555-4555-8555-555555555555', 6, 'Turn left at the traffic light.', '', 'Vire à esquerda no semáforo.', 'você', 'vire', 'à esquerda no semáforo'),
-- Saturn — Saúde e Emoções
('f6666666-6666-4666-8666-666666666666', 1, 'I don''t feel well today.', '', 'Não estou me sentindo bem hoje.', 'eu', 'não estou me sentindo', 'bem hoje'),
('f6666666-6666-4666-8666-666666666666', 2, 'My head hurts.', '', 'Minha cabeça dói.', 'minha cabeça', 'dói', ''),
('f6666666-6666-4666-8666-666666666666', 3, 'You should see a doctor.', '', 'Você deveria consultar um médico.', 'você', 'deveria consultar', 'um médico'),
('f6666666-6666-4666-8666-666666666666', 4, 'I am tired and stressed.', '', 'Estou cansado e estressado.', 'eu', 'estou', 'cansado e estressado'),
('f6666666-6666-4666-8666-666666666666', 5, 'Are you feeling better now?', '', 'Você está se sentindo melhor agora?', 'você', 'está se sentindo', 'melhor agora'),
('f6666666-6666-4666-8666-666666666666', 6, 'Take this medicine twice a day.', '', 'Tome este remédio duas vezes ao dia.', 'você', 'tome', 'este remédio duas vezes ao dia'),
-- Uranus — Trabalho e Negócios
('f7777777-7777-4777-8777-777777777777', 1, 'Can we schedule a meeting for Monday?', '', 'Podemos agendar uma reunião para segunda-feira?', 'nós', 'podemos agendar', 'uma reunião para segunda-feira'),
('f7777777-7777-4777-8777-777777777777', 2, 'I will send you the report by email.', '', 'Vou enviar o relatório por e-mail.', 'eu', 'vou enviar', 'o relatório por e-mail'),
('f7777777-7777-4777-8777-777777777777', 3, 'Could you call me back later?', '', 'Você poderia me ligar de volta mais tarde?', 'você', 'poderia ligar', 'me de volta mais tarde'),
('f7777777-7777-4777-8777-777777777777', 4, 'We need to finish the project by Friday.', '', 'Precisamos terminar o projeto até sexta-feira.', 'nós', 'precisamos', 'terminar o projeto até sexta-feira'),
('f7777777-7777-4777-8777-777777777777', 5, 'I work in sales.', '', 'Eu trabalho em vendas.', 'eu', 'trabalho', 'em vendas'),
('f7777777-7777-4777-8777-777777777777', 6, 'Let''s discuss this in the meeting.', '', 'Vamos discutir isso na reunião.', 'vamos', 'discutir', 'isso na reunião'),
-- Neptune — Conversas Avançadas
('f8888888-8888-4888-8888-888888888888', 1, 'In my opinion, this is a great idea.', '', 'Na minha opinião, esta é uma ótima ideia.', 'esta', 'é', 'uma ótima ideia'),
('f8888888-8888-4888-8888-888888888888', 2, 'If I had more time, I would travel more.', '', 'Se eu tivesse mais tempo, viajaria mais.', 'eu', 'viajaria', 'mais'),
('f8888888-8888-4888-8888-888888888888', 3, 'It''s a piece of cake!', '', 'É moleza!', 'É', '', 'moleza'),
('f8888888-8888-4888-8888-888888888888', 4, 'I can''t wait to see you.', '', 'Mal posso esperar para te ver.', 'eu', 'posso esperar', 'mal para te ver'),
('f8888888-8888-4888-8888-888888888888', 5, 'Tell me a story about your childhood.', '', 'Conte-me uma história sobre sua infância.', 'você', 'conte', 'me uma história sobre sua infância'),
('f8888888-8888-4888-8888-888888888888', 6, 'She has a lot of experience.', '', 'Ela tem muita experiência.', 'ela', 'tem', 'muita experiência');

-- ---------------------------------------------------------------------------
-- 7. Spanish course — lessons (4 per planet, titles in Spanish).
-- ---------------------------------------------------------------------------

INSERT INTO planet_lessons (planet_id, position, kind, title, description) VALUES
('e1111111-1111-4111-8111-111111111111', 1, 'learn',    'Primeras Palabras',          'Saludos, nombres y hola simples'),
('e1111111-1111-4111-8111-111111111111', 2, 'practice', 'Preséntate',                 'Di quién eres y de dónde eres'),
('e1111111-1111-4111-8111-111111111111', 3, 'test',     'Días y Números',             'Recuerda días, meses y contar'),
('e1111111-1111-4111-8111-111111111111', 4, 'master',   'Conoce a Alguien Nuevo',     'Mantén una primera conversación completa'),
('e2222222-2222-4222-8222-222222222222', 1, 'learn',    'Acciones Cotidianas',        'Verbos para lo que haces cada día'),
('e2222222-2222-4222-8222-222222222222', 2, 'practice', 'Tu Rutina',                  'Describe tu propio horario diario'),
('e2222222-2222-4222-8222-222222222222', 3, 'test',     'Pasado y Futuro',            'Cambia entre ayer, hoy y mañana'),
('e2222222-2222-4222-8222-222222222222', 4, 'master',   'Habla de Tu Día',            'Narra un día completo en voz alta'),
('e3333333-3333-4333-8333-333333333333', 1, 'learn',    'Pedir Ayuda',                'Frases para solicitar asistencia'),
('e3333333-3333-4333-8333-333333333333', 2, 'practice', 'Hacer Planes',               'Horas, horarios y disponibilidad'),
('e3333333-3333-4333-8333-333333333333', 3, 'test',     'Explicar Problemas',         'Describe lo que salió mal'),
('e3333333-3333-4333-8333-333333333333', 4, 'master',   'Resuélvelo Juntos',          'Resuelve un problema conversando'),
('e4444444-4444-4444-8444-444444444444', 1, 'learn',    'En el Restaurante',          'Pide comida y bebidas'),
('e4444444-4444-4444-8444-444444444444', 2, 'practice', 'En la Cocina',               'Cocinar y preparar comidas'),
('e4444444-4444-4444-8444-444444444444', 3, 'test',     'Gustos y Disgustos',         'Di preferencias y necesidades de comida'),
('e4444444-4444-4444-8444-444444444444', 4, 'master',   'Pide una Comida Completa',   'Maneja toda una visita al restaurante'),
('e5555555-5555-4555-8555-555555555555', 1, 'learn',    'Pedir Direcciones',          'Encuentra el camino a un lugar'),
('e5555555-5555-4555-8555-555555555555', 2, 'practice', 'Transporte Público',         'Autobuses, trenes, billetes y horarios'),
('e5555555-5555-4555-8555-555555555555', 3, 'test',     'Reservas y Billetes',        'Reserva habitaciones, asientos y vuelos'),
('e5555555-5555-4555-8555-555555555555', 4, 'master',   'Viaja por Tu Cuenta',        'Cruza una ciudad sin ayuda'),
('e6666666-6666-4666-8666-666666666666', 1, 'learn',    'Cómo Te Sientes',            'Di cuando algo anda mal'),
('e6666666-6666-4666-8666-666666666666', 2, 'practice', 'En el Médico',               'Partes del cuerpo y síntomas'),
('e6666666-6666-4666-8666-666666666666', 3, 'test',     'Emociones',                  'Nombra estados de ánimo y sentimientos'),
('e6666666-6666-4666-8666-666666666666', 4, 'master',   'Describe y Aconseja',        'Explica cómo te sientes y da consejos'),
('e7777777-7777-4777-8777-777777777777', 1, 'learn',    'Reuniones',                  'Agenda y únete a una reunión'),
('e7777777-7777-4777-8777-777777777777', 2, 'practice', 'Correos y Mensajes',         'Escribe y responde profesionalmente'),
('e7777777-7777-4777-8777-777777777777', 3, 'test',     'Llamadas Telefónicas',       'Maneja una llamada con confianza'),
('e7777777-7777-4777-8777-777777777777', 4, 'master',   'Dirige una Conversación',    'Lidera un intercambio de negocios completo'),
('e8888888-8888-4888-8888-888888888888', 1, 'learn',    'Da una Opinión',             'Expresa y respalda un punto de vista'),
('e8888888-8888-4888-8888-888888888888', 2, 'practice', 'Cuenta una Historia',        'Narra eventos con naturalidad'),
('e8888888-8888-4888-8888-888888888888', 3, 'test',     'Modismos',                   'Expresiones diarias que usan los nativos'),
('e8888888-8888-4888-8888-888888888888', 4, 'master',   'Habla Libremente',           'Mantén una conversación sin guion');

-- ---------------------------------------------------------------------------
-- 8. Portuguese course — lessons (4 per planet, titles in Portuguese).
-- ---------------------------------------------------------------------------

INSERT INTO planet_lessons (planet_id, position, kind, title, description) VALUES
('f1111111-1111-4111-8111-111111111111', 1, 'learn',    'Primeiras Palavras',     'Cumprimentos, nomes e olás simples'),
('f1111111-1111-4111-8111-111111111111', 2, 'practice', 'Apresente-se',            'Diga quem você é e de onde é'),
('f1111111-1111-4111-8111-111111111111', 3, 'test',     'Dias e Números',          'Lembre dias, meses e contagem'),
('f1111111-1111-4111-8111-111111111111', 4, 'master',   'Conheça Alguém Novo',     'Mantenha uma primeira conversa completa'),
('f2222222-2222-4222-8222-222222222222', 1, 'learn',    'Ações do Dia a Dia',      'Verbos para o que você faz todos os dias'),
('f2222222-2222-4222-8222-222222222222', 2, 'practice', 'Sua Rotina',              'Descreva sua própria agenda diária'),
('f2222222-2222-4222-8222-222222222222', 3, 'test',     'Passado e Futuro',        'Alterne entre ontem, hoje e amanhã'),
('f2222222-2222-4222-8222-222222222222', 4, 'master',   'Fale Sobre o Seu Dia',    'Narre um dia inteiro em voz alta'),
('f3333333-3333-4333-8333-333333333333', 1, 'learn',    'Pedir Ajuda',             'Frases para solicitar assistência'),
('f3333333-3333-4333-8333-333333333333', 2, 'practice', 'Fazer Planos',            'Horários, agendas e disponibilidade'),
('f3333333-3333-4333-8333-333333333333', 3, 'test',     'Explicar Problemas',      'Descreva o que deu errado'),
('f3333333-3333-4333-8333-333333333333', 4, 'master',   'Resolva Juntos',          'Resolva um problema em conversa'),
('f4444444-4444-4444-8444-444444444444', 1, 'learn',    'No Restaurante',          'Peça comida e bebidas'),
('f4444444-4444-4444-8444-444444444444', 2, 'practice', 'Na Cozinha',              'Cozinhar e preparar refeições'),
('f4444444-4444-4444-8444-444444444444', 3, 'test',     'Gostos e Desgostos',      'Diga preferências e necessidades alimentares'),
('f4444444-4444-4444-8444-444444444444', 4, 'master',   'Peça uma Refeição Completa', 'Cuide de toda a visita ao restaurante'),
('f5555555-5555-4555-8555-555555555555', 1, 'learn',    'Pedir Direções',          'Encontre o caminho para um lugar'),
('f5555555-5555-4555-8555-555555555555', 2, 'practice', 'Transporte Público',      'Ônibus, trens, bilhetes e horários'),
('f5555555-5555-4555-8555-555555555555', 3, 'test',     'Reservas e Bilhetes',     'Reserve quartos, assentos e voos'),
('f5555555-5555-4555-8555-555555555555', 4, 'master',   'Viaje Sozinho',           'Atravesse uma cidade sem ajuda'),
('f6666666-6666-4666-8666-666666666666', 1, 'learn',    'Como Você Se Sente',      'Diga quando algo está errado'),
('f6666666-6666-4666-8666-666666666666', 2, 'practice', 'No Médico',               'Partes do corpo e sintomas'),
('f6666666-6666-4666-8666-666666666666', 3, 'test',     'Emoções',                 'Nomeie humores e sentimentos'),
('f6666666-6666-4666-8666-666666666666', 4, 'master',   'Descreva e Aconselhe',    'Explique como se sente e dê conselhos'),
('f7777777-7777-4777-8777-777777777777', 1, 'learn',    'Reuniões',                'Agende e participe de uma reunião'),
('f7777777-7777-4777-8777-777777777777', 2, 'practice', 'E-mails e Mensagens',     'Escreva e responda profissionalmente'),
('f7777777-7777-4777-8777-777777777777', 3, 'test',     'Ligações',                'Atenda uma chamada com confiança'),
('f7777777-7777-4777-8777-777777777777', 4, 'master',   'Conduza uma Conversa',    'Lidere uma troca de negócios completa'),
('f8888888-8888-4888-8888-888888888888', 1, 'learn',    'Dê uma Opinião',          'Expresse e defenda um ponto de vista'),
('f8888888-8888-4888-8888-888888888888', 2, 'practice', 'Conte uma História',      'Narre eventos com naturalidade'),
('f8888888-8888-4888-8888-888888888888', 3, 'test',     'Expressões',              'Expressões diárias que os nativos usam'),
('f8888888-8888-4888-8888-888888888888', 4, 'master',   'Fale Livremente',         'Mantenha uma conversa sem roteiro');

-- ---------------------------------------------------------------------------
-- 9. Spanish course — scripted lesson steps (tutor teaches in Portuguese,
--    target language is Spanish). Mirrors the English course's per-planet
--    structure exactly (same step kinds/positions).
-- ---------------------------------------------------------------------------

INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mercury (Primeros Contactos)
('e1111111-1111-4111-8111-111111111111', 1, 'teach',
 '"bom dia" em espanhol é "buenos días". Escute: buenos días. Agora repita.',
 'buenos días', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 2, 'repeat',
 'Muito bem! Vamos dizer de novo, com um ritmo mais natural.',
 'buenos días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Mais uma vez, com calma e clareza.',
 'buenos días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 4, 'teach',
 '"Boa tarde" é "buenas tardes". Escute com atenção: buenas tardes. Agora é sua vez.',
 'buenas tardes', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfeito. Mais uma vez, por favor.',
 'buenas tardes', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 6, 'question',
 'Agora, como se diz "eu vim consertar a mesa" em espanhol? Tente.',
 'Vine a arreglar la mesa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 7, 'correction',
 'Quase! O passado de "venir" é "vine". Escute: vine a arreglar la mesa. Agora tente de novo.',
 'Vine a arreglar la mesa', NULL,
 'Yo venir a arreglar la mesa',
 'Vine a arreglar la mesa',
 'Para dizer "eu vim", usamos o pretérito de "venir", que é "vine". "Yo venir" é a forma infinitiva; "vine" é o passado.',
 'Eu vim consertar a mesa',
 'venir', 'yo', 'vine', 'a arreglar la mesa'),
('e1111111-1111-4111-8111-111111111111', 8, 'review',
 'Pergunta surpresa! Como se diz "quarta-feira" em espanhol?',
 'miércoles', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 9, 'question',
 'E "boa tarde"? Responda em espanhol.',
 'buenas tardes', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e1111111-1111-4111-8111-111111111111', 10, 'praise',
 'Excelente! Você está indo muito bem. Vamos continuar — hoje praticamos os dias da semana.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Venus (Rutina y Acciones)
('e2222222-2222-4222-8222-222222222222', 1, 'teach',
 '"eu trabalho todos os dias" em espanhol é "trabajo todos los días". Escute: trabajo todos los días. Agora repita.',
 'trabajo todos los días', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 2, 'repeat',
 'Muito bem! Diga de novo com ritmo natural.',
 'trabajo todos los días', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 3, 'teach',
 'Para falar do passado: "eu trabalhei ontem" é "trabajé ayer". Escute: trabajé ayer. Agora você tenta.',
 'trabajé ayer', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 4, 'question',
 'E o futuro? Como se diz "eu vou trabalhar amanhã"?',
 'trabajaré mañana', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 5, 'question',
 'Agora no negativo: "eu não trabalho aos domingos".',
 'no trabajo los domingos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 6, 'question',
 'Como você perguntaria "você trabalha aqui?"',
 '¿Trabajas aquí?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e2222222-2222-4222-8222-222222222222', 7, 'praise',
 'Excelente! Você conhece os verbos de rotina no presente, passado, futuro, negativo e interrogativo. Vamos em frente.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Earth (Trabajo y Vida Diaria)
('e3333333-3333-4333-8333-333333333333', 1, 'teach',
 '"eu preciso de ajuda" em espanhol é "necesito ayuda". Escute: necesito ayuda. Agora repita.',
 'necesito ayuda', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e3333333-3333-4333-8333-333333333333', 2, 'repeat',
 'Muito bem! Mais uma vez, com calma e clareza.',
 'necesito ayuda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e3333333-3333-4333-8333-333333333333', 3, 'teach',
 'Para pedir ajuda educadamente: "¿Puedes ayudarme, por favor?". Escute: ¿Puedes ayudarme, por favor? Agora é sua vez.',
 '¿Puedes ayudarme, por favor?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e3333333-3333-4333-8333-333333333333', 4, 'question',
 'Como se diz "há um problema com o meu computador"?',
 'Hay un problema con mi computadora', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e3333333-3333-4333-8333-333333333333', 5, 'praise',
 'Ótimo trabalho! Pedir ajuda e relatar problemas — você está construindo espanhol real para o dia a dia.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Mars (Comida y Alimentación)
('e4444444-4444-4444-8444-444444444444', 1, 'teach',
 '"eu gostaria de pedir uma pizza" em espanhol é "me gustaría pedir una pizza, por favor". Escute: me gustaría pedir una pizza. Agora repita.',
 'me gustaría pedir una pizza, por favor', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e4444444-4444-4444-8444-444444444444', 2, 'repeat',
 'Muito bem! Diga de novo com ritmo natural.',
 'me gustaría pedir una pizza, por favor', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e4444444-4444-4444-8444-444444444444', 3, 'teach',
 'Para negar: "eu não como carne" é "no como carne". Escute: no como carne. Agora você tenta.',
 'no como carne', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e4444444-4444-4444-8444-444444444444', 4, 'question',
 'Como se diz "estou com sede" em espanhol?',
 'tengo sed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e4444444-4444-4444-8444-444444444444', 5, 'praise',
 'Excelente! Você sabe pedir comida e falar sobre alimentação. Vamos continuar.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Jupiter (Viajes y Desplazamientos)
('e5555555-5555-4555-8555-555555555555', 1, 'teach',
 'Para pedir informações: "com licença, onde fica a estação de trem?" em espanhol é "Disculpe, ¿dónde está la estación de tren?". Escute: Disculpe, ¿dónde está la estación de tren? Agora repita.',
 'Disculpe, ¿dónde está la estación de tren?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e5555555-5555-4555-8555-555555555555', 2, 'repeat',
 'Muito bem! Mais uma vez, com calma e clareza.',
 'Disculpe, ¿dónde está la estación de tren?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e5555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Eu preciso reservar um quarto de hotel" é "necesito reservar una habitación de hotel". Escute: necesito reservar una habitación de hotel. Agora é sua vez.',
 'necesito reservar una habitación de hotel', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e5555555-5555-4555-8555-555555555555', 4, 'question',
 'Como se diz "vire à esquerda no semáforo"?',
 'gira a la izquierda en el semáforo', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e5555555-5555-4555-8555-555555555555', 5, 'praise',
 'Ótimo trabalho! Você consegue se orientar. Vamos continuar.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturn (Salud y Emociones)
('e6666666-6666-4666-8666-666666666666', 1, 'teach',
 '"não estou me sentindo bem hoje" em espanhol é "hoy no me siento bien". Escute: hoy no me siento bien. Agora repita.',
 'hoy no me siento bien', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e6666666-6666-4666-8666-666666666666', 2, 'repeat',
 'Muito bem! Diga de novo com ritmo natural.',
 'hoy no me siento bien', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e6666666-6666-4666-8666-666666666666', 3, 'teach',
 'Para dar conselho: "você deveria consultar um médico" é "deberías ver a un médico". Escute: deberías ver a un médico.',
 'deberías ver a un médico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e6666666-6666-4666-8666-666666666666', 4, 'question',
 'Como você pergunta "você está se sentindo melhor agora?"',
 '¿Te sientes mejor ahora?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e6666666-6666-4666-8666-666666666666', 5, 'praise',
 'Excelente! Você consegue falar sobre saúde e sentimentos.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Uranus (Trabajo y Negocios)
('e7777777-7777-4777-8777-777777777777', 1, 'teach',
 'No trabalho: "podemos agendar uma reunião para segunda-feira?" em espanhol é "¿Podemos agendar una reunión para el lunes?". Escute: ¿Podemos agendar una reunión para el lunes? Agora repita.',
 '¿Podemos agendar una reunión para el lunes?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e7777777-7777-4777-8777-777777777777', 2, 'repeat',
 'Muito bem! Mais uma vez, por favor.',
 '¿Podemos agendar una reunión para el lunes?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e7777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Vou enviar o relatório por e-mail" é "te enviaré el informe por correo electrónico". Escute: te enviaré el informe por correo electrónico.',
 'te enviaré el informe por correo electrónico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e7777777-7777-4777-8777-777777777777', 4, 'question',
 'Como se diz "precisamos terminar o projeto até sexta-feira"?',
 'necesitamos terminar el proyecto para el viernes', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e7777777-7777-4777-8777-777777777777', 5, 'praise',
 'Ótimo trabalho! Você está construindo espanhol profissional de verdade.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptune (Conversaciones Avanzadas)
('e8888888-8888-4888-8888-888888888888', 1, 'teach',
 'Para dar opinião: "na minha opinião, esta é uma ótima ideia" em espanhol é "en mi opinión, esta es una gran idea". Escute: en mi opinión, esta es una gran idea. Agora repita.',
 'en mi opinión, esta es una gran idea', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e8888888-8888-4888-8888-888888888888', 2, 'repeat',
 'Muito bem! Diga de novo com ritmo natural.',
 'en mi opinión, esta es una gran idea', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e8888888-8888-4888-8888-888888888888', 3, 'teach',
 'Uma expressão útil: "é moleza!" é "¡es pan comido!". Escute: ¡es pan comido!.',
 '¡es pan comido!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e8888888-8888-4888-8888-888888888888', 4, 'question',
 'Como se diz "mal posso esperar para te ver"?',
 'no puedo esperar para verte', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('e8888888-8888-4888-8888-888888888888', 5, 'praise',
 'Incrível! Você está falando com naturalidade e confiança.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- ---------------------------------------------------------------------------
-- 10. Portuguese course — scripted lesson steps (tutor teaches in English,
--     target language is Portuguese). Mirrors the English course structure.
-- ---------------------------------------------------------------------------

INSERT INTO lesson_steps
    (planet_id, position, kind, tutor_text, expected_text, mastery_gain,
     correction_said, correction_corrected, correction_explanation, correction_pt,
     correction_mistake_part, correction_subject, correction_verb, correction_complement)
VALUES
-- Mercury (Primeiros Contatos)
('f1111111-1111-4111-8111-111111111111', 1, 'teach',
 '"good morning" em português é "bom dia". Listen: bom dia. Now repeat.',
 'bom dia', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 2, 'repeat',
 'Very good! Let''s say it again, with a more natural rhythm.',
 'bom dia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 3, 'repeat',
 'Once more, nice and clear.',
 'bom dia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 4, 'teach',
 '"Boa tarde" is "good afternoon" in reverse — say "boa tarde". Listen carefully: boa tarde. Now it''s your turn.',
 'boa tarde', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 5, 'repeat',
 'Perfect. One more time, please.',
 'boa tarde', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 6, 'question',
 'Now, how do you say "I came to fix the table" in Portuguese? Try it.',
 'Eu vim consertar a mesa', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 7, 'correction',
 'Almost! To say "eu vim" we use the past of "vir", which is "vim". Listen: eu vim consertar a mesa. Now you try.',
 'Eu vim consertar a mesa', NULL,
 'Eu vem consertar a mesa',
 'Eu vim consertar a mesa',
 'To say "eu vim" (I came), use the past of "vir", which is "vim". "Eu vem" is not a form of "vir" — the correct past is "vim".',
 'I came to fix the table',
 'vem', 'eu', 'vim', 'consertar a mesa'),
('f1111111-1111-4111-8111-111111111111', 8, 'review',
 'Surprise check! How do you say "Wednesday" in Portuguese?',
 'quarta-feira', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 9, 'question',
 'And "boa tarde"? Answer me in Portuguese.',
 'boa tarde', 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f1111111-1111-4111-8111-111111111111', 10, 'praise',
 'Excellent! You''re doing great. Let''s keep going — today we practice the days of the week.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Venus (Rotina e Ações)
('f2222222-2222-4222-8222-222222222222', 1, 'teach',
 '"eu trabalho todos os dias" is "I work every day" — say: eu trabalho todos os dias. Listen: eu trabalho todos os dias. Now repeat.',
 'eu trabalho todos os dias', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'eu trabalho todos os dias', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 3, 'teach',
 'To talk about the past: "eu trabalhei ontem" is "I worked yesterday" — say: eu trabalhei ontem. Listen: eu trabalhei ontem. Now you try.',
 'eu trabalhei ontem', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 4, 'question',
 'And the future? How do you say "I will work tomorrow" in Portuguese?',
 'eu vou trabalhar amanhã', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 5, 'question',
 'Now make it negative: "I don''t work on Sundays".',
 'eu não trabalho aos domingos', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 6, 'question',
 'How would you ask "do you work here?" in Portuguese?',
 'você trabalha aqui?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f2222222-2222-4222-8222-222222222222', 7, 'praise',
 'Excellent! You know routine verbs in the present, past, future, negative and question forms. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Earth (Trabalho e Vida Diária)
('f3333333-3333-4333-8333-333333333333', 1, 'teach',
 '"eu preciso de ajuda" is "I need help" — say: eu preciso de ajuda. Listen: eu preciso de ajuda. Now repeat.',
 'eu preciso de ajuda', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f3333333-3333-4333-8333-333333333333', 2, 'repeat',
 'Very good! Once more, nice and clear.',
 'eu preciso de ajuda', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f3333333-3333-4333-8333-333333333333', 3, 'teach',
 'To ask for help politely: "você pode me ajudar, por favor?". Listen: você pode me ajudar, por favor? Now it''s your turn.',
 'você pode me ajudar, por favor?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f3333333-3333-4333-8333-333333333333', 4, 'question',
 'How do you say "there is a problem with my computer" in Portuguese?',
 'há um problema com o meu computador', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f3333333-3333-4333-8333-333333333333', 5, 'praise',
 'Great job! Asking for help and reporting problems — you''re building real daily-life Portuguese.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Mars (Comida e Alimentação)
('f4444444-4444-4444-8444-444444444444', 1, 'teach',
 '"eu gostaria de pedir uma pizza" is "I would like to order a pizza" — say: eu gostaria de pedir uma pizza, por favor. Listen: eu gostaria de pedir uma pizza. Now repeat.',
 'eu gostaria de pedir uma pizza, por favor', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f4444444-4444-4444-8444-444444444444', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'eu gostaria de pedir uma pizza, por favor', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f4444444-4444-4444-8444-444444444444', 3, 'teach',
 'To negate: "eu não como carne" is "I don''t eat meat" — say: eu não como carne. Listen: eu não como carne. Now you try.',
 'eu não como carne', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f4444444-4444-4444-8444-444444444444', 4, 'question',
 'How do you say "I''m thirsty" in Portuguese?',
 'estou com sede', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f4444444-4444-4444-8444-444444444444', 5, 'praise',
 'Excellent! You can order food and talk about eating. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Jupiter (Viagens e Deslocamentos)
('f5555555-5555-4555-8555-555555555555', 1, 'teach',
 'To ask for information: "com licença, onde fica a estação de trem?" is "excuse me, where is the train station?" — say: com licença, onde fica a estação de trem? Listen: com licença, onde fica a estação de trem? Now repeat.',
 'com licença, onde fica a estação de trem?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f5555555-5555-4555-8555-555555555555', 2, 'repeat',
 'Very good! One more time, nice and clear.',
 'com licença, onde fica a estação de trem?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f5555555-5555-4555-8555-555555555555', 3, 'teach',
 '"Eu preciso reservar um quarto de hotel" is "I need to book a hotel room" — say: eu preciso reservar um quarto de hotel. Listen: eu preciso reservar um quarto de hotel. Now it''s your turn.',
 'eu preciso reservar um quarto de hotel', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f5555555-5555-4555-8555-555555555555', 4, 'question',
 'How do you say "turn left at the traffic light" in Portuguese?',
 'vire à esquerda no semáforo', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f5555555-5555-4555-8555-555555555555', 5, 'praise',
 'Great job! You can find your way around. Let''s keep going.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Saturn (Saúde e Emoções)
('f6666666-6666-4666-8666-666666666666', 1, 'teach',
 '"não estou me sentindo bem hoje" is "I don''t feel well today" — say: não estou me sentindo bem hoje. Listen: não estou me sentindo bem hoje. Now repeat.',
 'não estou me sentindo bem hoje', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f6666666-6666-4666-8666-666666666666', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'não estou me sentindo bem hoje', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f6666666-6666-4666-8666-666666666666', 3, 'teach',
 'To give advice: "você deveria consultar um médico" is "you should see a doctor" — say: você deveria consultar um médico. Listen: você deveria consultar um médico.',
 'você deveria consultar um médico', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f6666666-6666-4666-8666-666666666666', 4, 'question',
 'How do you ask "are you feeling better now?" in Portuguese?',
 'você está se sentindo melhor agora?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f6666666-6666-4666-8666-666666666666', 5, 'praise',
 'Excellent! You can talk about health and feelings.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Uranus (Trabalho e Negócios)
('f7777777-7777-4777-8777-777777777777', 1, 'teach',
 'At work: "podemos agendar uma reunião para segunda-feira?" is "can we schedule a meeting for Monday?" — say: podemos agendar uma reunião para segunda-feira? Listen: podemos agendar uma reunião para segunda-feira? Now repeat.',
 'podemos agendar uma reunião para segunda-feira?', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f7777777-7777-4777-8777-777777777777', 2, 'repeat',
 'Very good! One more time, please.',
 'podemos agendar uma reunião para segunda-feira?', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f7777777-7777-4777-8777-777777777777', 3, 'teach',
 '"Vou enviar o relatório por e-mail" is "I will send you the report by email" — say: vou enviar o relatório por e-mail. Listen: vou enviar o relatório por e-mail.',
 'vou enviar o relatório por e-mail', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f7777777-7777-4777-8777-777777777777', 4, 'question',
 'How do you say "we need to finish the project by Friday" in Portuguese?',
 'precisamos terminar o projeto até sexta-feira', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f7777777-7777-4777-8777-777777777777', 5, 'praise',
 'Great job! You are building real professional Portuguese.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
-- Neptune (Conversas Avançadas)
('f8888888-8888-4888-8888-888888888888', 1, 'teach',
 'To give an opinion: "na minha opinião, esta é uma ótima ideia" is "in my opinion, this is a great idea" — say: na minha opinião, esta é uma ótima ideia. Listen: na minha opinião, esta é uma ótima ideia. Now repeat.',
 'na minha opinião, esta é uma ótima ideia', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f8888888-8888-4888-8888-888888888888', 2, 'repeat',
 'Very good! Say it again with a natural rhythm.',
 'na minha opinião, esta é uma ótima ideia', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f8888888-8888-4888-8888-888888888888', 3, 'teach',
 'A useful expression: "é moleza!" is "it''s a piece of cake!" — say: é moleza!. Listen: é moleza!.',
 'é moleza!', 0.06, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f8888888-8888-4888-8888-888888888888', 4, 'question',
 'How do you say "I can''t wait to see you" in Portuguese?',
 'mal posso esperar para te ver', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('f8888888-8888-4888-8888-888888888888', 5, 'praise',
 'Outstanding! You are speaking naturally and with confidence.',
 NULL, 0.05, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
