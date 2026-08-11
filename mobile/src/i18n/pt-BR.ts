import type { Translations } from './en';

/**
 * Brazilian Portuguese UI strings. Must implement every key in `en.ts` —
 * TypeScript enforces this via the `Translations` type, so a missing key is
 * a build error, not a silent English fallback in production.
 */
export const ptBR: Translations = {
  // Common
  'common.somethingWrong': 'Algo deu errado',
  'common.tryAgain': 'Tentar novamente',

  // Language switcher (language names stay in their own language)
  'language.change': 'Mudar idioma',
  'language.en': 'English',
  'language.ptBR': 'Português (Brasil)',

  // Networking (api/client.ts)
  'api.networkUnreachable': 'Não foi possível conectar ao servidor. O backend está rodando?',
  'api.requestFailed': 'Falha na requisição (status {{status}})',

  // Auth — shared
  'auth.email': 'E-mail',
  'auth.emailPlaceholder': 'voce@exemplo.com',
  'auth.password': 'Senha',
  'auth.showPassword': 'Mostrar senha',
  'auth.hidePassword': 'Ocultar senha',
  'auth.emailInvalid': 'Digite um e-mail válido',
  'auth.passwordRequired': 'Digite sua senha',

  // Auth — login
  'auth.login.title': 'Bem-vindo de volta!',
  'auth.login.subtitle': 'Continue de onde parou — seu tutor está pronto para conversar.',
  'auth.login.passwordPlaceholder': 'Sua senha',
  'auth.login.submit': 'Entrar',
  'auth.login.or': 'ou',
  'auth.login.noAccount': 'Novo no Huppy? ',
  'auth.login.createAccount': 'Criar uma conta',

  // Auth — register
  'auth.register.title': 'Crie sua conta',
  'auth.register.subtitle': 'Comece a falar inglês hoje — leva só um minuto.',
  'auth.register.passwordPlaceholder': 'Pelo menos {{min}} caracteres',
  'auth.register.confirmPassword': 'Confirmar senha',
  'auth.register.confirmPlaceholder': 'Repita sua senha',
  'auth.register.submit': 'Cadastrar',
  'auth.register.haveAccount': 'Já tem uma conta? ',
  'auth.register.logIn': 'Entrar',
  'auth.register.passwordTooShort': 'Use pelo menos {{min}} caracteres',
  'auth.register.passwordMismatch': 'As senhas não coincidem',
  'auth.register.strengthTooShort': 'Muito curta',
  'auth.register.strengthWeak': 'Fraca',
  'auth.register.strengthOkay': 'Razoável',
  'auth.register.strengthGood': 'Boa',
  'auth.register.strengthStrong': 'Forte',

  // Splash
  'splash.tagline': 'Seu tutor de inglês com IA',

  // Bottom tab bar
  'tabBar.cards': 'Cartões',
  'tabBar.chat': 'Chat',
  'tabBar.planets': 'Planetas',

  // Chat — header
  'chat.greeting': 'Oi, {{name}}',
  'chat.guestName': 'visitante',
  'chat.planetPill': 'Planeta {{number}} · {{title}}',
  'chat.loadingPlanets': 'Carregando planetas…',
  'chat.logOut': 'Sair',
  'chat.history': 'Histórico de conversas',
  'chat.modeDemo': 'Demo',
  'chat.modeLive': 'Ao vivo',

  // Chat — banners
  'chat.unlockNotice': 'Planeta {{number}} desbloqueado! Continue assim.',
  'chat.sessionLive': 'Sessão ao vivo · transcrita automaticamente',
  'chat.sessionDemo': 'Aula · transcrita automaticamente',
  'chat.preparingLesson': 'Preparando sua aula…',
  'chat.lessonError': 'Não foi possível carregar a aula. Verifique o backend e toque para tentar novamente.',

  // Chat — message kind labels
  'chat.kind.teach': 'Ensino',
  'chat.kind.repeat': 'Repetição',
  'chat.kind.question': 'Pergunta',
  'chat.kind.praise': 'Elogio',
  'chat.kind.review': 'Revisão',
  'chat.kind.correction': 'Correção',

  // Chat — correction card
  'chat.correction.title': 'Correção inteligente',
  'chat.correction.youSaid': 'Você disse',
  'chat.correction.correct': 'Correto',
  'chat.correction.playing': 'Reproduzindo…',
  'chat.correction.hearIt': 'Ouvir',
  'chat.correction.addedToCards': 'Adicionado aos cartões',
  'chat.correction.adding': 'Adicionando…',
  'chat.correction.makeCard': 'Criar cartão',
  'chat.correction.saving': 'Salvando…',
  'chat.correction.pronunciation': 'Pronúncia',

  // Chat — listening state
  'chat.listening': 'Ouvindo…',
  'chat.paused': 'Pausado',

  // Chat — orb button
  'chat.orb.connecting': '…',
  'chat.orb.stop': 'Parar',
  'chat.orb.start': 'Iniciar',
  'chat.orb.play': 'Reproduzir',

  // Chat — orb hint
  'chat.hint.connecting': 'Conectando ao seu tutor…',
  'chat.hint.tutorSpeaking': 'O tutor está falando — toque para interromper',
  'chat.hint.micLive': 'O microfone está ativo — é só falar. Toque para encerrar.',
  'chat.hint.tapToStart': 'Toque para iniciar a conversa',
  'chat.hint.demoPause': 'Aula demo · toque para pausar',
  'chat.hint.demoResume': 'Pausado · toque para continuar',

  // Chat — history list & detail
  'chat.history.title': 'Histórico',
  'chat.history.subtitle': 'Suas aulas e conversas',
  'chat.history.loading': 'Carregando conversas…',
  'chat.history.empty': 'Nenhuma conversa ainda',
  'chat.history.emptyBody': 'Quando você conversar, tudo será salvo aqui para revisão.',
  'chat.history.messageCountOne': '{{count}} mensagem',
  'chat.history.messageCountOther': '{{count}} mensagens',
  'chat.history.defaultTitle': 'Conversa',
  'chat.history.transcript': 'Transcrição e correções',
  'chat.history.detailLoading': 'Carregando…',
  'chat.history.noMessages': 'Esta conversa ainda não tem mensagens.',
  'chat.history.liveConversationTitle': 'Conversa ao vivo',
  'chat.history.lessonTitle': 'Aula · Planeta {{number}}',

  // Flashcards
  'flashcards.header': 'Cartões',
  'flashcards.headerSub': 'A repetição espaçada mantém tudo fresco',
  'flashcards.allCards': 'Todos os cartões',
  'flashcards.cardOne': '{{count}} cartão',
  'flashcards.cardOther': '{{count}} cartões',
  'flashcards.dueNow': '{{count}} para revisar agora',
  'flashcards.planetDeck': 'Planeta {{number}} · {{title}}',
  'flashcards.tip':
    'Cartões marcados como Difícil voltam mais cedo. Cartões marcados como Fácil são testados de novo mais tarde para confirmar que você realmente sabe.',
  'flashcards.loadingCards': 'Carregando seus cartões…',
  'flashcards.emptyTitle': 'Nenhum cartão por aqui ainda',
  'flashcards.emptyBody':
    'Os cartões são criados automaticamente a partir das suas correções e aulas. Pratique no Chat e eles vão aparecer aqui.',
  'flashcards.caughtUpTitle': 'Tudo em dia!',
  'flashcards.caughtUpBody':
    'Não há nada para revisar agora. Continue conversando — novas correções viram cartões, e os difíceis voltam mais cedo.',
  'flashcards.cardOfTotal': 'Cartão {{index}} de {{total}} · {{due}} para revisar',
  'flashcards.nextCard': 'Próximo cartão',
  'flashcards.front': 'FRENTE',
  'flashcards.back': 'VERSO',
  'flashcards.listen': 'Ouvir',
  'flashcards.playing': 'Reproduzindo…',
  'flashcards.tapToFlip': 'Toque para virar',
  'flashcards.tapToFlipBack': 'Toque para virar de volta',
  'flashcards.ratingQuestion': 'O quanto você sabia isso?',
  'flashcards.ratingHard': 'Difícil',
  'flashcards.ratingMedium': 'Médio',
  'flashcards.ratingEasy': 'Fácil',
  'flashcards.planetFallback': 'Planeta',

  // Planets
  'planets.audioModeEnglishOnly': 'Só inglês',
  'planets.audioModeEnglishPause': 'Inglês + pausa',
  'planets.audioModePtEn': 'PT → EN',
  'planets.audioModeRandom': 'Ordem aleatória',
  'planets.audioModeHardReview': 'Revisão difícil',
  'planets.tapToListen': 'Toque em play para ouvir',
  'planets.couldNotLoadAudio': 'Não foi possível carregar o áudio',
  'planets.listening': 'Ouvindo…',
  'planets.continuousAudio': 'Áudio contínuo',
  'planets.forTheCarOne': 'para o carro · {{count}} frase',
  'planets.forTheCarOther': 'para o carro · {{count}} frases',
  'planets.statSentences': 'Frases',
  'planets.statListening': 'Escuta',
  'planets.statFlashcards': 'Cartões',
  'planets.statMastery': 'Domínio',
  'planets.unlockProgress': 'Progresso de desbloqueio',
  'planets.yourProgress': 'Seu progresso',
  'planets.lessons': 'Aulas',
  'planets.hideAudio': 'Ocultar áudio',
  'planets.listenInCar': 'Ouvir no carro',
  'planets.completed': 'Concluído',
  'planets.continue': 'Continuar',
  'planets.locked': 'Bloqueado',
  'planets.noLessons': 'Ainda não há aulas.',
  'planets.loadingLessons': 'Carregando aulas…',
  'planets.planetComplete': 'Planeta concluído',
  'planets.continueLesson': 'Continuar aula {{position}}',
  'planets.back': 'Voltar',
  'planets.previousPlanet': 'Planeta anterior',
  'planets.nextPlanet': 'Próximo planeta',
  'planets.traveling': 'Viajando até os planetas…',
  'planets.planetTag': 'Planeta {{number}}',
  'planets.pause': 'Pausar',
  'planets.play': 'Reproduzir',

  // Voice (useVoiceConversation.ts)
  'voice.micPermissionTitle': 'Acesso ao microfone',
  'voice.micPermissionMessage': 'O Huppy precisa do microfone para você praticar a fala em inglês.',
  'voice.micPermissionAllow': 'Permitir',
  'voice.micPermissionDeny': 'Negar',
  'voice.micFailedToStart': 'Não foi possível iniciar o microfone. Verifique as permissões.',
  'voice.micPermissionRequired':
    'É necessário permitir o microfone para praticar a fala. Ative-o em Ajustes e tente novamente.',
  'voice.couldNotStartSession': 'Não foi possível iniciar a sessão',
  'voice.connectionLost': 'Conexão perdida. Verifique sua rede e tente novamente.',
  'voice.sessionEnded': 'A sessão terminou inesperadamente.',
};
