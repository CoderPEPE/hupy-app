import type { Translations } from './en';

/**
 * Spanish UI strings (Latin American). Must implement every key in `en.ts` —
 * TypeScript enforces this via the `Translations` type, so a missing key is
 * a build error, not a silent English fallback in production.
 */
export const es: Translations = {
  // Common
  'common.somethingWrong': 'Algo salió mal',
  'common.tryAgain': 'Intentar de nuevo',
  'common.back': 'Volver',
  'common.close': 'Cerrar',
  'common.continue': 'Continuar',

  // Language switcher (language names stay in their own language)
  'language.change': 'Cambiar idioma',
  'language.en': 'English',
  'language.es': 'Español',
  'language.pt': 'Português',
  'language.ptBR': 'Português (Brasil)',

  // Networking (api/client.ts)
  'api.networkUnreachable': 'No se pudo conectar con el servidor. ¿Está el backend en marcha?',
  'api.requestFailed': 'La solicitud falló (estado {{status}})',

  // Full-screen offline state (components/OfflineScreen.tsx)
  'offline.title': 'Sin conexión',
  'offline.body': 'Huppy necesita el servidor para llegar a tu tutor. Revisa tu conexión a internet: nos reconectaremos automáticamente.',
  'offline.retry': 'Intentar de nuevo',

  // Auth — shared
  'auth.email': 'Correo electrónico',
  'auth.emailPlaceholder': 'tu@ejemplo.com',
  'auth.password': 'Contraseña',
  'auth.showPassword': 'Mostrar contraseña',
  'auth.hidePassword': 'Ocultar contraseña',
  'auth.name': 'Nombre',
  'auth.namePlaceholder': '¿Cómo quieres que te llamemos?',
  'auth.nameRequired': 'Ingresa tu nombre',
  'auth.emailInvalid': 'Ingresa un correo electrónico válido',
  'auth.passwordRequired': 'Ingresa tu contraseña',

  // Auth — login
  'auth.login.title': '¡Bienvenido de nuevo!',
  'auth.login.subtitle': 'Continúa donde lo dejaste: tu tutor está listo para conversar.',
  'auth.login.passwordPlaceholder': 'Tu contraseña',
  'auth.login.submit': 'Iniciar sesión',
  'auth.login.or': 'o',
  'auth.login.continueWith': 'Continuar con',
  'auth.login.continueWithProvider': 'Continuar con {{provider}}',
  'auth.login.orEmail': 'o inicia sesión con correo',
  'auth.login.noAccount': '¿Nuevo en Huppy? ',
  'auth.login.createAccount': 'Crea una cuenta',
  'auth.rememberMe': 'Recordarme',
  'auth.forgotPassword': '¿Olvidaste tu contraseña?',
  'auth.aiCard.title': 'Aprende más rápido con IA',
  'auth.aiCard.body': 'Lecciones personalizadas, conversaciones reales y progreso que se adapta a ti.',
  'auth.termsPrefix': 'Al continuar, aceptas nuestros ',
  'auth.terms': 'Términos de Uso',
  'auth.and': ' y ',
  'auth.privacy': 'Política de Privacidad',

  // Auth — register
  'auth.register.title': 'Crea tu cuenta',
  'auth.register.subtitle': 'Empieza a hablar hoy mismo: solo toma un minuto.',
  'auth.register.passwordPlaceholder': 'Al menos {{min}} caracteres',
  'auth.register.confirmPassword': 'Confirmar contraseña',
  'auth.register.confirmPlaceholder': 'Repite tu contraseña',
  'auth.register.submit': 'Registrarme',
  'auth.register.haveAccount': '¿Ya tienes una cuenta? ',
  'auth.register.logIn': 'Iniciar sesión',
  'auth.register.passwordTooShort': 'Usa al menos {{min}} caracteres',
  'auth.register.passwordMismatch': 'Las contraseñas no coinciden',
  'auth.register.strengthTooShort': 'Muy corta',
  'auth.register.strengthWeak': 'Débil',
  'auth.register.strengthOkay': 'Aceptable',
  'auth.register.strengthGood': 'Buena',
  'auth.register.strengthStrong': 'Fuerte',

  // Splash
  'splash.tagline': 'Tu tutor de idiomas con IA',

  // Bottom tab bar
  'tabBar.cards': 'Tarjetas',
  'tabBar.chat': 'Chat',
  'tabBar.planets': 'Planetas',
  'tabBar.lessons': 'Lecciones',
  'tabBar.profile': 'Perfil',

  // Profile
  'profile.streak': 'Racha',
  'profile.level': 'Nivel',
  'profile.bestStreak': 'Mejor racha',
  'profile.badges': 'Logros',
  'profile.levelShort': 'Nv. {{level}}',
  'profile.viewAll': 'Ver todo',
  'profile.viewLess': 'Ver menos',
  'profile.settings': 'Ajustes',
  'profile.changeLanguageSub': 'Elige tu idioma de aprendizaje',
  'profile.changeVoiceSub': 'Elige la voz de tu tutor',
  'profile.editName': 'Editar nombre',
  'profile.changeNameSub': 'Tu nombre para mostrar',
  'profile.saveName': 'Guardar',
  'profile.nameFallback': 'Define tu nombre',
  'profile.noBadges': 'Aún no tienes logros: empieza una lección para ganar tu primero.',
  // Streak hints (only shown when the underlying number is real)
  'profile.streakKeepGoing': '¡Sigue así! 🔥',
  'profile.streakStart': 'Empieza hoy',
  'profile.streakPersonalBest': '¡Récord personal! 🏆',
  // Level tiers, derived from XP
  'profile.tierBeginner': 'Principiante',
  'profile.tierElementary': 'Básico',
  'profile.tierIntermediate': 'Intermedio',
  'profile.tierAdvanced': 'Avanzado',

  // Home (planets landing)
  'home.greeting': '¡Hola, {{name}}!',
  'home.subtitle': 'Continuemos tu viaje.',
  'home.yourPlanets': 'Tus planetas',
  'home.seeAll': 'Ver todo',

  // Chat — header
  'chat.greeting': 'Hola, {{name}}',
  'chat.guestName': 'visitante',
  'chat.planetPill': 'Planeta {{number}} · {{title}}',
  'chat.loadingPlanets': 'Cargando planetas…',
  'chat.logOut': 'Cerrar sesión',
  'chat.history': 'Historial de conversaciones',
  'chat.modeDemo': 'Demo',
  'chat.modeLive': 'En vivo',

  // Chat — step indicator
  'chat.step.listen': 'Escuchar',
  'chat.step.shadow': 'Shadowing',
  'chat.step.speak': 'Hablar',
  'chat.step.correct': 'Corregir',
  'chat.listenPrompt': 'Escucha la frase',
  'chat.speakPrompt': 'Tu turno de hablar',
  'chat.correctPrompt': 'Aquí está tu corrección',
  'chat.waitingForTutor': 'Preparando tu primera frase…',

  // Chat — banners
  'chat.unlockNotice': '¡Planeta {{number}} desbloqueado! Sigue así.',
  'chat.sessionLive': 'Sesión en vivo · transcrita automáticamente',
  'chat.sessionDemo': 'Lección · transcrita automáticamente',
  'chat.preparingLesson': 'Preparando tu lección…',
  'chat.lessonError': 'No se pudo cargar la lección. Revisa el backend y toca para reintentar.',

  // Chat — message kind labels
  'chat.kind.teach': 'Enseñanza',
  'chat.kind.repeat': 'Repetición',
  'chat.kind.question': 'Pregunta',
  'chat.kind.praise': 'Elogio',
  'chat.kind.review': 'Repaso',
  'chat.kind.correction': 'Corrección',

  // Chat — correction card
  'chat.correction.title': 'Corrección inteligente',
  'chat.correction.youSaid': 'Dijiste',
  'chat.correction.correct': 'Correcto',
  'chat.correction.playing': 'Reproduciendo…',
  'chat.correction.hearIt': 'Escuchar',
  'chat.correction.addedToCards': 'Añadida a las tarjetas',
  'chat.correction.adding': 'Añadiendo…',
  'chat.correction.makeCard': 'Crear tarjeta',
  'chat.correction.saving': 'Guardando…',
  'chat.correction.pronunciation': 'Pronunciación',

  // Chat — listening state
  'chat.listening': 'Escuchando…',
  'chat.paused': 'En pausa',

  // Chat — orb button
  'chat.orb.connecting': '…',
  'chat.orb.stop': 'Detener',
  'chat.orb.start': 'Iniciar',
  'chat.orb.play': 'Reproducir',

  // Chat — orb hint
  'chat.hint.connecting': 'Conectando con tu tutor…',
  'chat.hint.tutorSpeaking': 'El tutor está hablando: toca ■ para terminar',
  'chat.hint.micLive': 'El micrófono está activo: solo habla. Toca ■ para terminar.',
  'chat.hint.tapToStart': 'Toca para iniciar la conversación',
  'chat.hint.demoPause': 'Lección demo · toca para pausar',
  'chat.hint.demoResume': 'En pausa · toca para continuar',

  // Chat — history list & detail
  'chat.history.title': 'Historial',
  'chat.history.subtitle': 'Tus lecciones y conversaciones',
  'chat.history.loading': 'Cargando conversaciones…',
  'chat.history.empty': 'Aún no hay conversaciones',
  'chat.history.emptyBody': 'Cuando converses, todo se guarda aquí para repasarlo.',
  'chat.history.messageCountOne': '{{count}} mensaje',
  'chat.history.messageCountOther': '{{count}} mensajes',
  'chat.history.defaultTitle': 'Conversación',
  'chat.history.transcript': 'Transcripción y correcciones',
  'chat.history.detailLoading': 'Cargando…',
  'chat.history.noMessages': 'Esta conversación aún no tiene mensajes.',
  'chat.history.liveConversationTitle': 'Conversación en vivo',
  'chat.history.lessonTitle': 'Lección · Planeta {{number}}',

  // Flashcards
  'flashcards.header': 'Tarjetas',
  'flashcards.headerSub': 'La repetición espaciada lo mantiene fresco',
  'flashcards.allCards': 'Todas las tarjetas',
  'flashcards.studyNow': 'Estudiar ahora',
  'flashcards.cardOne': '{{count}} tarjeta',
  'flashcards.cardOther': '{{count}} tarjetas',
  'flashcards.dueNow': '{{count}} pendientes',
  'flashcards.planetDeck': 'Planeta {{number}} · {{title}}',
  'flashcards.tip':
    'Las tarjetas marcadas como Difícil vuelven antes. Las marcadas como Aprendida se prueban más tarde para confirmar que realmente las sabes.',
  'flashcards.loadingCards': 'Cargando tus tarjetas…',
  'flashcards.emptyTitle': 'Aún no hay tarjetas aquí',
  'flashcards.emptyBody':
    'Las tarjetas se crean automáticamente a partir de tus correcciones y lecciones. Practica en el Chat y aparecerán aquí.',
  'flashcards.caughtUpTitle': '¡Todo al día!',
  'flashcards.caughtUpBody':
    'No hay nada pendiente ahora mismo. Sigue conversando: las nuevas correcciones se vuelven tarjetas y las difíciles vuelven antes.',
  'flashcards.cardOfTotal': 'Tarjeta {{index}} de {{total}} · {{due}} pendientes',
  'flashcards.nextCard': 'Siguiente tarjeta',
  'flashcards.front': 'ANVERSO',
  'flashcards.back': 'REVERSO',
  'flashcards.listen': 'Escuchar',
  'flashcards.playing': 'Reproduciendo…',
  'flashcards.tapToFlip': 'Toca para voltear',
  'flashcards.tapToFlipBack': 'Toca para voltear de nuevo',
  'flashcards.ratingQuestion': '¿Qué tan bien la sabías?',
  'flashcards.ratingHard': 'Difícil',
  'flashcards.ratingMedium': 'Casi',
  'flashcards.ratingEasy': 'Aprendida',
  'flashcards.planetFallback': 'Planeta',
  'flashcards.pendingRecheck': 'Marcada como fácil: Huppy lo confirmará en vivo',
  'flashcards.structureBack': 'Estructura',
  'flashcards.toReview': 'Repasar',
  'flashcards.learned': 'Aprendidas',
  'flashcards.retention': 'Tu retención',
  'flashcards.nextReview': 'Próximo repaso',
  'flashcards.nextReviewInOne': 'en {{days}} día',
  'flashcards.nextReviewInOther': 'en {{days}} días',
  'flashcards.rememberPhrase': 'Recuerda la frase',
  'flashcards.ratingForgot': 'No la sabía',
  'flashcards.axisToday': 'Hoy',
  'flashcards.axisPlus1': '+1d',
  'flashcards.axisPlus3': '+3d',
  'flashcards.axisPlus5': '+5d',
  'flashcards.axisPlus7': '+7d',
  'flashcards.axisPlus14': '+14d',
  'flashcards.axisPlus30': '+30d',

  // Planets
  'planets.audioModeLanguageOnly': 'Solo el idioma',
  'planets.audioModeLanguagePause': 'Idioma + pausa',
  'planets.audioModeRandom': 'Orden aleatorio',
  'planets.audioModeHardReview': 'Repaso difícil',
  'planets.tapToListen': 'Toca play para escuchar',
  'planets.couldNotLoadAudio': 'No se pudo cargar el audio',
  'planets.listening': 'Escuchando…',
  'planets.yourTurn': 'Tu turno: repítelo ahora…',
  'planets.continuousAudio': 'Audio continuo',
  'planets.forTheCarOne': 'para el auto · {{count}} frase',
  'planets.forTheCarOther': 'para el auto · {{count}} frases',
  'planets.statSentences': 'Frases',
  'planets.statListening': 'Escucha',
  'planets.statFlashcards': 'Tarjetas',
  'planets.statMastery': 'Dominio',
  'planets.statPronunciation': 'Pronunciación',
  'planets.statConversation': 'Conversación',
  'planets.statReview': 'Repaso',
  'planets.unlockProgress': 'Progreso de desbloqueo',
  'planets.yourProgress': 'Tu progreso',
  'planets.lessons': 'Lecciones',
  'planets.hideAudio': 'Ocultar audio',
  'planets.listenInCar': 'Escuchar en el auto',
  'planets.completed': 'Completado',
  'planets.continue': 'Continuar',
  'planets.locked': 'Bloqueado',
  'planets.noLessons': 'Aún no hay lecciones.',
  'planets.loadingLessons': 'Cargando lecciones…',
  'planets.planetComplete': 'Planeta completado',
  'planets.continueLesson': 'Continuar lección {{position}}',
  'planets.back': 'Volver',
  'planets.previousPlanet': 'Planeta anterior',
  'planets.nextPlanet': 'Siguiente planeta',
  'planets.traveling': 'Viajando a los planetas…',
  'planets.planetTag': 'Planeta {{number}}',
  'planets.pause': 'Pausar',
  'planets.play': 'Reproducir',

  // Chapter intro (shown before a lesson starts)
  'chapterIntro.chapter': 'Capítulo {{position}}',
  'chapterIntro.lessonsLeftOne': '{{count}} lección para el próximo capítulo',
  'chapterIntro.lessonsLeftOther': '{{count}} lecciones para el próximo capítulo',
  'chapterIntro.start': 'Empezar la lección',
  'chapterIntro.myWords': 'Mis palabras',
  'chapterIntro.livePractice': 'Práctica en vivo',

  // Language picker
  'languagePicker.title': 'Elige tu idioma',
  'languagePicker.subtitle': 'Puedes cambiarlo más tarde.',
  'languagePicker.iSpeak': 'Hablo',
  'languagePicker.iWantToLearn': 'Quiero aprender',
  'languagePicker.continue': 'Continuar',

  // Voice picker (Profile settings)
  'voicePicker.title': 'Voz del tutor',
  'voicePicker.subtitle': 'Elige quién te enseña',
  'voicePicker.female': 'Voces femeninas',
  'voicePicker.male': 'Voces masculinas',
  'voicePicker.speaks': 'Habla {{language}}',
  'voicePicker.play': 'Reproducir',
  'voicePicker.playing': 'Reproduciendo…',
  'voicePicker.playFailed': 'Sin sonido — reintentar',
  'voicePicker.previewNote': 'La vista previa dice un saludo en {{language}}',
  'voicePicker.done': 'Listo',

  // Achievements
  // Level-up celebrations — el overlay global de GamificationCelebration
  'levelUp.title': '¡Subiste de nivel!',
  'levelUp.reached': 'Alcanzaste el nivel {{level}}',
  'levelUp.xpToNext': '{{xp}} XP para el siguiente nivel',
  'levelUp.achievement': '¡Logro desbloqueado!',
  'achievements.title': 'Logros',
  'achievements.earnedOf': '{{earned}} de {{total}}',
  'achievements.xpReward': '+{{xp}} XP',
  'achievements.showEarned': 'Solo conseguidos',
  'achievements.showAll': 'Ver todos',
  'achievements.catLessons': 'Lecciones',
  'achievements.catPlanets': 'Planetas',
  'achievements.catSentences': 'Frases',
  'achievements.catCards': 'Tarjetas',
  'achievements.catConversation': 'Conversación',
  'achievements.catCorrections': 'Correcciones',
  'achievements.catStreak': 'Rachas',
  'achievements.catXp': 'Experiencia',

  // Course overview (pre-login) — every figure comes from /api/planets/catalog
  'course.title': 'Lo que vas a aprender',
  'course.eyebrow': 'EL MÉTODO HUPPY',
  'course.body':
    'Cada frase se practica en voz alta con tu tutor, se corrige al instante y vuelve para repasarse justo antes de que la olvides.',
  'course.cta': 'Empezar a aprender',
  'course.statPlanets': 'Mundos',
  'course.statSentences': 'Frases',
  'course.statLessons': 'Lecciones',
  'course.loading': 'Cargando el curso…',
  'course.bubble': 'Habla desde tu primera lección.',
  'course.stepSpeak': 'Habla en voz alta',
  'course.stepSpeakBody': 'Conversación por voz en vivo, no opción múltiple.',
  'course.stepCorrect': 'Te corrigen al instante',
  'course.stepCorrectBody': 'Cada error se convierte en una tarjeta para repasar.',
  'course.stepReview': 'Repasa en el momento justo',
  'course.stepReviewBody': 'La repetición espaciada programa cada frase para ti.',

  // Mic / voice-recognition permission modal
  'permissionModal.title': '¡Tu turno de hablar!',
  'permissionModal.body': 'Activa el Micrófono y el Reconocimiento de Voz para que Huppy corrija tu pronunciación.',
  'permissionModal.unlockMic': 'Activar micrófono',
  'permissionModal.unlockSpeech': 'Activar reconocimiento de voz',

  // Voice (useVoiceConversation.ts)
  'voice.micPermissionTitle': 'Acceso al micrófono',
  'voice.micPermissionMessage': 'Huppy necesita el micrófono para que practiques hablar.',
  'voice.micPermissionAllow': 'Permitir',
  'voice.micPermissionDeny': 'Denegar',
  'voice.micFailedToStart': 'No se pudo iniciar el micrófono. Revisa los permisos.',
  'voice.micPermissionRequired':
    'Se necesita el permiso del micrófono para practicar la conversación. Actívalo en Ajustes e inténtalo de nuevo.',
  'voice.couldNotStartSession': 'No se pudo iniciar la sesión',
  'voice.connectionLost': 'Se perdió la conexión. Revisa tu red e inténtalo de nuevo.',
  'voice.sessionEnded': 'La sesión terminó de forma inesperada.',
};
