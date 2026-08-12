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
  'common.back': 'Voltar',
  'common.close': 'Fechar',
  'common.continue': 'Continuar',

  // Language switcher (language names stay in their own language)
  'language.change': 'Mudar idioma',
  'language.en': 'English',
  'language.es': 'Español',
  'language.pt': 'Português',
  'language.ptBR': 'Português (Brasil)',

  // Networking (api/client.ts)
  'api.networkUnreachable': 'Não foi possível conectar ao servidor. O backend está rodando?',
  'api.requestFailed': 'Falha na requisição (status {{status}})',

  // Full-screen offline state (components/OfflineScreen.tsx)
  'offline.title': 'Sem conexão',
  'offline.body': 'O Huppy precisa do servidor para falar com seu tutor. Verifique sua conexão com a internet — vamos reconectar automaticamente.',
  'offline.retry': 'Tentar novamente',

  // Auth — shared
  'auth.email': 'E-mail',
  'auth.emailPlaceholder': 'voce@exemplo.com',
  'auth.password': 'Senha',
  'auth.showPassword': 'Mostrar senha',
  'auth.hidePassword': 'Ocultar senha',
  'auth.name': 'Nome',
  'auth.namePlaceholder': 'Como devemos te chamar?',
  'auth.nameRequired': 'Digite seu nome',
  'auth.emailInvalid': 'Digite um e-mail válido',
  'auth.passwordRequired': 'Digite sua senha',

  // Auth — login
  'auth.login.title': 'Bem-vindo de volta!',
  'auth.login.subtitle': 'Continue de onde parou — seu tutor está pronto para conversar.',
  'auth.login.passwordPlaceholder': 'Sua senha',
  'auth.login.submit': 'Entrar',
  'auth.login.or': 'ou',
  'auth.login.continueWith': 'Continuar com',
  'auth.login.continueWithProvider': 'Continuar com {{provider}}',
  'auth.login.orEmail': 'ou entre com e-mail',
  'auth.login.noAccount': 'Novo no Huppy? ',
  'auth.login.createAccount': 'Criar uma conta',
  'auth.rememberMe': 'Lembrar de mim',
  'auth.forgotPassword': 'Esqueceu a senha?',
  'auth.aiCard.title': 'Aprenda mais rápido com IA',
  'auth.aiCard.body': 'Aulas personalizadas, conversas reais e progresso que se adapta a você.',
  'auth.termsPrefix': 'Ao continuar, você concorda com nossos ',
  'auth.terms': 'Termos de Uso',
  'auth.and': ' e ',
  'auth.privacy': 'Política de Privacidade',

  // Auth — register
  'auth.register.title': 'Crie sua conta',
  'auth.register.subtitle': 'Comece a falar hoje — leva só um minuto.',
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
  'splash.tagline': 'Seu tutor de idiomas com IA',

  // Bottom tab bar
  'tabBar.cards': 'Cartões',
  'tabBar.chat': 'Chat',
  'tabBar.planets': 'Planetas',
  'tabBar.lessons': 'Aulas',
  'tabBar.profile': 'Perfil',

  // Profile
  'profile.streak': 'Sequência',
  'profile.level': 'Nível',
  'profile.bestStreak': 'Melhor sequência',
  'profile.badges': 'Conquistas',
  'profile.levelShort': 'Nv. {{level}}',
  'profile.viewAll': 'Ver todas',
  'profile.viewLess': 'Ver menos',
  'profile.settings': 'Configurações',
  'profile.changeLanguageSub': 'Escolha seu idioma de estudo',
  'profile.changeVoiceSub': 'Escolha a voz do seu tutor',
  'profile.editName': 'Editar nome',
  'profile.changeNameSub': 'Seu nome de exibição',
  'profile.saveName': 'Salvar',
  'profile.nameFallback': 'Defina seu nome',
  'profile.noBadges': 'Nenhuma conquista ainda — comece uma aula para ganhar a primeira.',
  // Streak hints (only shown when the underlying number is real)
  'profile.streakKeepGoing': 'Continue assim! 🔥',
  'profile.streakStart': 'Comece hoje',
  'profile.streakPersonalBest': 'Recorde pessoal! 🏆',
  // Level tiers, derived from XP
  'profile.tierBeginner': 'Iniciante',
  'profile.tierElementary': 'Básico',
  'profile.tierIntermediate': 'Intermediário',
  'profile.tierAdvanced': 'Avançado',

  // Home (planets landing)
  'home.greeting': 'Oi, {{name}}!',
  'home.subtitle': 'Vamos continuar sua jornada.',
  'home.yourPlanets': 'Seus planetas',
  'home.seeAll': 'Ver tudo',

  // Chat — header
  'chat.greeting': 'Oi, {{name}}',
  'chat.guestName': 'visitante',
  'chat.planetPill': 'Planeta {{number}} · {{title}}',
  'chat.loadingPlanets': 'Carregando planetas…',
  'chat.logOut': 'Sair',
  'chat.history': 'Histórico de conversas',
  'chat.modeDemo': 'Demo',
  'chat.modeLive': 'Ao vivo',

  // Chat — step indicator
  'chat.step.listen': 'Escutar',
  'chat.step.shadow': 'Shadowing',
  'chat.step.speak': 'Falar',
  'chat.step.correct': 'Corrigir',
  'chat.listenPrompt': 'Escute a frase',
  'chat.speakPrompt': 'Sua vez de falar',
  'chat.correctPrompt': 'Aqui está sua correção',
  'chat.waitingForTutor': 'Preparando sua primeira frase…',

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
  'chat.hint.tutorSpeaking': 'O tutor está falando — toque em ■ para encerrar',
  'chat.hint.micLive': 'O microfone está ativo — é só falar. Toque em ■ para encerrar.',
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
  'flashcards.studyNow': 'Estudar agora',
  'flashcards.cardOne': '{{count}} cartão',
  'flashcards.cardOther': '{{count}} cartões',
  'flashcards.dueNow': '{{count}} para revisar agora',
  'flashcards.planetDeck': 'Planeta {{number}} · {{title}}',
  'flashcards.tip':
    'Cartões marcados como Difícil voltam mais cedo. Cartões marcados como Aprendi são testados de novo mais tarde para confirmar que você realmente sabe.',
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
  'flashcards.ratingMedium': 'Quase',
  'flashcards.ratingEasy': 'Aprendi',
  'flashcards.planetFallback': 'Planeta',
  'flashcards.pendingRecheck': 'Marcado como fácil — o Huppy vai confirmar isso ao vivo',
  'flashcards.structureBack': 'Estrutura',
  'flashcards.toReview': 'Revisar',
  'flashcards.learned': 'Aprendidos',
  'flashcards.retention': 'Sua retenção',
  'flashcards.nextReview': 'Próxima revisão',
  'flashcards.nextReviewInOne': 'em {{days}} dia',
  'flashcards.nextReviewInOther': 'em {{days}} dias',
  'flashcards.rememberPhrase': 'Lembre-se da frase',
  'flashcards.ratingForgot': 'Não lembrei',
  'flashcards.axisToday': 'Hoje',
  // Compact chart-axis ticks — "d" for "dia", so they fit like en/es.
  'flashcards.axisPlus1': '+1d',
  'flashcards.axisPlus3': '+3d',
  'flashcards.axisPlus5': '+5d',
  'flashcards.axisPlus7': '+7d',
  'flashcards.axisPlus14': '+14d',
  'flashcards.axisPlus30': '+30d',

  // Planets
  'planets.audioModeLanguageOnly': 'Só o idioma',
  'planets.audioModeLanguagePause': 'Idioma + pausa',
  'planets.audioModeRandom': 'Ordem aleatória',
  'planets.audioModeHardReview': 'Revisão difícil',
  'planets.tapToListen': 'Toque em play para ouvir',
  'planets.couldNotLoadAudio': 'Não foi possível carregar o áudio',
  'planets.listening': 'Ouvindo…',
  'planets.yourTurn': 'Sua vez — repita agora…',
  'planets.continuousAudio': 'Áudio contínuo',
  'planets.forTheCarOne': 'para o carro · {{count}} frase',
  'planets.forTheCarOther': 'para o carro · {{count}} frases',
  'planets.statSentences': 'Frases',
  'planets.statListening': 'Escuta',
  'planets.statFlashcards': 'Cartões',
  'planets.statMastery': 'Domínio',
  'planets.statPronunciation': 'Pronúncia',
  'planets.statConversation': 'Conversação',
  'planets.statReview': 'Revisão',
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

  // Chapter intro (shown before a lesson starts)
  'chapterIntro.chapter': 'Capítulo {{position}}',
  'chapterIntro.lessonsLeftOne': '{{count}} aula para o próximo capítulo',
  'chapterIntro.lessonsLeftOther': '{{count}} aulas para o próximo capítulo',
  'chapterIntro.start': 'Começar a aula',
  'chapterIntro.myWords': 'Minhas palavras',
  'chapterIntro.livePractice': 'Prática ao vivo',

  // Language picker
  'languagePicker.title': 'Escolha seu idioma',
  'languagePicker.subtitle': 'Você pode mudar isso depois.',
  'languagePicker.iSpeak': 'Eu falo',
  'languagePicker.iWantToLearn': 'Eu quero aprender',
  'languagePicker.continue': 'Continuar',

  // Voice picker (Profile settings)
  'voicePicker.title': 'Voz do tutor',
  'voicePicker.subtitle': 'Escolha quem vai te ensinar',
  'voicePicker.female': 'Vozes femininas',
  'voicePicker.male': 'Vozes masculinas',
  'voicePicker.speaks': 'Fala {{language}}',
  'voicePicker.play': 'Reproduzir',
  'voicePicker.playing': 'Reproduzindo…',
  'voicePicker.playFailed': 'Sem som — tentar de novo',
  'voicePicker.previewNote': 'A prévia fala uma saudação em {{language}}',
  'voicePicker.done': 'Pronto',

  // Achievements
  // Level-up celebrations — o overlay global GamificationCelebration
  'levelUp.title': 'Subiu de nível!',
  'levelUp.reached': 'Você alcançou o nível {{level}}',
  'levelUp.xpToNext': '{{xp}} XP para o próximo nível',
  'levelUp.achievement': 'Conquista desbloqueada!',
  'achievements.title': 'Conquistas',
  'achievements.earnedOf': '{{earned}} de {{total}}',
  'achievements.xpReward': '+{{xp}} XP',
  'achievements.showEarned': 'Só as conquistadas',
  'achievements.showAll': 'Ver todas',
  'achievements.catLessons': 'Aulas',
  'achievements.catPlanets': 'Planetas',
  'achievements.catSentences': 'Frases',
  'achievements.catCards': 'Cartões',
  'achievements.catConversation': 'Conversa',
  'achievements.catCorrections': 'Correções',
  'achievements.catStreak': 'Sequências',
  'achievements.catXp': 'Experiência',

  // Course overview (pre-login) — every figure comes from /api/planets/catalog
  'course.title': 'O que você vai aprender',
  'course.eyebrow': 'O MÉTODO HUPPY',
  'course.body':
    'Cada frase é praticada em voz alta com seu tutor, corrigida na hora e revisada pouco antes de você esquecer.',
  'course.cta': 'Começar a aprender',
  'course.statPlanets': 'Mundos',
  'course.statSentences': 'Frases',
  'course.statLessons': 'Aulas',
  'course.loading': 'Carregando o curso…',
  'course.bubble': 'Fale desde a sua primeira aula.',
  'course.stepSpeak': 'Fale em voz alta',
  'course.stepSpeakBody': 'Conversa por voz ao vivo, não múltipla escolha.',
  'course.stepCorrect': 'Seja corrigido na hora',
  'course.stepCorrectBody': 'Cada erro vira um cartão para você revisar.',
  'course.stepReview': 'Revise na hora certa',
  'course.stepReviewBody': 'A repetição espaçada agenda cada frase para você.',

  // Mic / voice-recognition permission modal
  'permissionModal.title': 'Sua vez de falar!',
  'permissionModal.body': 'Ative o Microfone e o Reconhecimento de Voz para o Huppy corrigir a sua pronúncia.',
  'permissionModal.unlockMic': 'Ativar microfone',
  'permissionModal.unlockSpeech': 'Ativar reconhecimento de voz',

  // Voice (useVoiceConversation.ts)
  'voice.micPermissionTitle': 'Acesso ao microfone',
  'voice.micPermissionMessage': 'O Huppy precisa do microfone para você praticar a fala.',
  'voice.micPermissionAllow': 'Permitir',
  'voice.micPermissionDeny': 'Negar',
  'voice.micFailedToStart': 'Não foi possível iniciar o microfone. Verifique as permissões.',
  'voice.micPermissionRequired':
    'É necessário permitir o microfone para praticar a fala. Ative-o em Ajustes e tente novamente.',
  'voice.couldNotStartSession': 'Não foi possível iniciar a sessão',
  'voice.connectionLost': 'Conexão perdida. Verifique sua rede e tente novamente.',
  'voice.sessionEnded': 'A sessão terminou inesperadamente.',
  'voice.sessionError': 'Erro na sessão: {{message}}',
};
