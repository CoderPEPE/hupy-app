/**
 * English UI strings. This is the source of truth for translation keys —
 * `pt-BR.ts` must implement exactly the same key set (checked by TypeScript
 * via `Translations` in `./index.ts`).
 */
export const en = {
  // Common
  'common.somethingWrong': 'Something went wrong',
  'common.tryAgain': 'Try again',

  // Language switcher
  'language.change': 'Change language',
  'language.en': 'English',
  'language.es': 'Español',
  'language.pt': 'Português',
  'language.ptBR': 'Português (Brasil)',

  // Networking (api/client.ts)
  'api.networkUnreachable': 'Could not reach the server. Is the backend running?',
  'api.requestFailed': 'Request failed with status {{status}}',

  // Auth — shared
  'auth.email': 'Email',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.password': 'Password',
  'auth.showPassword': 'Show password',
  'auth.hidePassword': 'Hide password',
  'auth.emailInvalid': 'Enter a valid email address',
  'auth.passwordRequired': 'Enter your password',

  // Auth — login
  'auth.login.title': 'Welcome back!',
  'auth.login.subtitle': 'Pick up where you left off — your tutor is ready to chat.',
  'auth.login.passwordPlaceholder': 'Your password',
  'auth.login.submit': 'Log in',
  'auth.login.or': 'or',
  'auth.login.continueWith': 'Continue with',
  'auth.login.orEmail': 'or log in with email',
  'auth.login.noAccount': 'New to Huppy? ',
  'auth.login.createAccount': 'Create an account',
  'auth.rememberMe': 'Remember me',
  'auth.forgotPassword': 'Forgot password?',
  'auth.aiCard.title': 'Learn faster with AI',
  'auth.aiCard.body': 'Personalized lessons, real conversations, and progress that adapts to you.',
  'auth.termsPrefix': 'By continuing, you agree to our ',
  'auth.terms': 'Terms of Use',
  'auth.and': ' and ',
  'auth.privacy': 'Privacy Policy',

  // Auth — register
  'auth.register.title': 'Create your account',
  'auth.register.subtitle': 'Start speaking English today — it only takes a minute.',
  'auth.register.passwordPlaceholder': 'At least {{min}} characters',
  'auth.register.confirmPassword': 'Confirm password',
  'auth.register.confirmPlaceholder': 'Repeat your password',
  'auth.register.submit': 'Sign up',
  'auth.register.haveAccount': 'Already have an account? ',
  'auth.register.logIn': 'Log in',
  'auth.register.passwordTooShort': 'Use at least {{min}} characters',
  'auth.register.passwordMismatch': 'Passwords do not match',
  'auth.register.strengthTooShort': 'Too short',
  'auth.register.strengthWeak': 'Weak',
  'auth.register.strengthOkay': 'Okay',
  'auth.register.strengthGood': 'Good',
  'auth.register.strengthStrong': 'Strong',

  // Splash
  'splash.tagline': 'Your AI English tutor',

  // Bottom tab bar
  'tabBar.cards': 'Cards',
  'tabBar.chat': 'Chat',
  'tabBar.planets': 'Planets',
  'tabBar.lessons': 'Lessons',
  'tabBar.profile': 'Profile',

  // Profile
  'profile.streak': 'Streak',
  'profile.level': 'Level',
  'profile.bestStreak': 'Best streak',
  'profile.badges': 'Badges',
  'profile.levelShort': 'Lv. {{level}}',
  'profile.viewAll': 'View all',
  'profile.viewLess': 'Show less',
  'profile.settings': 'Settings',
  'profile.changeLanguageSub': 'Select your learning language',
  'profile.changeVoiceSub': 'Choose your tutor’s voice',
  'profile.noBadges': 'No badges yet — start a lesson to earn your first.',
  // Streak hints (only shown when the underlying number is real)
  'profile.streakKeepGoing': 'Keep it up! 🔥',
  'profile.streakStart': 'Start one today',
  'profile.streakPersonalBest': 'Personal best! 🏆',
  // Level tiers, derived from XP
  'profile.tierBeginner': 'Beginner',
  'profile.tierElementary': 'Elementary',
  'profile.tierIntermediate': 'Intermediate',
  'profile.tierAdvanced': 'Advanced',

  // Home (planets landing)
  'home.greeting': 'Hi, {{name}}!',
  'home.subtitle': "Let's continue your journey.",
  'home.yourPlanets': 'Your planets',
  'home.seeAll': 'See all',
  'home.menu': 'Menu',

  // Chat — header
  'chat.greeting': 'Hi, {{name}}',
  'chat.guestName': 'there',
  'chat.planetPill': 'Planet {{number}} · {{title}}',
  'chat.loadingPlanets': 'Loading planets…',
  'chat.logOut': 'Log out',
  'chat.history': 'Conversation history',
  'chat.modeDemo': 'Demo',
  'chat.modeLive': 'Live',

  // Chat — step indicator (approximates the live conversation as 4 phases;
  // "Shadowing" and "Falar" are split by a short timer since the realtime
  // API doesn't expose a discrete signal for "still repeating" vs "talking
  // freely" — see ChatScreen.tsx)
  'chat.step.listen': 'Listen',
  'chat.step.shadow': 'Shadowing',
  'chat.step.speak': 'Speak',
  'chat.step.correct': 'Correct',
  'chat.listenPrompt': 'Listen to the phrase',
  'chat.speakPrompt': 'Your turn to speak',
  'chat.correctPrompt': 'Here is your correction',
  'chat.waitingForTutor': 'Getting your first phrase ready…',

  // Chat — banners
  'chat.unlockNotice': 'Planet {{number}} unlocked! Keep going.',
  'chat.sessionLive': 'Live session · automatically transcribed',
  'chat.sessionDemo': 'Lesson · automatically transcribed',
  'chat.preparingLesson': 'Preparing your lesson…',
  'chat.lessonError': 'Couldn’t load the lesson. Check the backend and tap to retry.',

  // Chat — message kind labels
  'chat.kind.teach': 'Teaching',
  'chat.kind.repeat': 'Repeat',
  'chat.kind.question': 'Question',
  'chat.kind.praise': 'Praise',
  'chat.kind.review': 'Review',
  'chat.kind.correction': 'Correction',

  // Chat — correction card
  'chat.correction.title': 'Smart correction',
  'chat.correction.youSaid': 'You said',
  'chat.correction.correct': 'Correct',
  'chat.correction.playing': 'Playing…',
  'chat.correction.hearIt': 'Hear it',
  'chat.correction.addedToCards': 'Added to cards',
  'chat.correction.adding': 'Adding…',
  'chat.correction.makeCard': 'Make a card',
  'chat.correction.saving': 'Saving…',
  'chat.correction.pronunciation': 'Pronunciation',

  // Chat — listening state
  'chat.listening': 'Listening…',
  'chat.paused': 'Paused',

  // Chat — orb button
  'chat.orb.connecting': '…',
  'chat.orb.stop': 'Stop',
  'chat.orb.start': 'Start',
  'chat.orb.play': 'Play',

  // Chat — orb hint
  'chat.hint.connecting': 'Connecting to your tutor…',
  'chat.hint.tutorSpeaking': 'Tutor is speaking — tap ■ to end',
  'chat.hint.micLive': 'Mic is live — just talk. Tap ■ to end.',
  'chat.hint.tapToStart': 'Tap to start the conversation',
  'chat.hint.demoPause': 'Demo lesson · tap to pause',
  'chat.hint.demoResume': 'Paused · tap to resume',

  // Chat — history list & detail
  'chat.history.title': 'History',
  'chat.history.subtitle': 'Your lessons & conversations',
  'chat.history.loading': 'Loading conversations…',
  'chat.history.empty': 'No conversations yet',
  'chat.history.emptyBody': 'When you chat, everything is saved here for review.',
  'chat.history.messageCountOne': '{{count}} message',
  'chat.history.messageCountOther': '{{count}} messages',
  'chat.history.defaultTitle': 'Conversation',
  'chat.history.transcript': 'Transcript & corrections',
  'chat.history.detailLoading': 'Loading…',
  'chat.history.noMessages': 'This conversation has no messages yet.',
  'chat.history.liveConversationTitle': 'Live conversation',
  'chat.history.lessonTitle': 'Lesson · Planet {{number}}',

  // Flashcards
  'flashcards.header': 'Flashcards',
  'flashcards.headerSub': 'Spaced repetition keeps it fresh',
  'flashcards.allCards': 'All cards',
  'flashcards.cardOne': '{{count}} card',
  'flashcards.cardOther': '{{count}} cards',
  'flashcards.dueNow': '{{count}} due now',
  'flashcards.planetDeck': 'Planet {{number}} · {{title}}',
  'flashcards.tip':
    'Cards marked Hard come back sooner. Easy cards are tested again later to confirm you really know them.',
  'flashcards.loadingCards': 'Loading your cards…',
  'flashcards.emptyTitle': 'No cards here yet',
  'flashcards.emptyBody':
    'Cards are created automatically from your corrections and lessons. Practice in Chat and they will appear here.',
  'flashcards.caughtUpTitle': 'All caught up!',
  'flashcards.caughtUpBody':
    'Nothing is due right now. Keep chatting — new corrections become cards, and difficult cards come back sooner.',
  'flashcards.cardOfTotal': 'Card {{index}} of {{total}} · {{due}} due now',
  'flashcards.nextCard': 'Next card',
  'flashcards.front': 'FRONT',
  'flashcards.back': 'BACK',
  'flashcards.listen': 'Listen',
  'flashcards.playing': 'Playing…',
  'flashcards.tapToFlip': 'Tap to flip',
  'flashcards.tapToFlipBack': 'Tap to flip back',
  'flashcards.ratingQuestion': 'How well did you know it?',
  'flashcards.ratingHard': 'Hard',
  'flashcards.ratingMedium': 'Almost',
  'flashcards.ratingEasy': 'Learned',
  'flashcards.planetFallback': 'Planet',
  'flashcards.pendingRecheck': "Marked easy — Huppy will double-check this live",
  'flashcards.structureBack': 'Structure',
  'flashcards.toReview': 'Review',
  'flashcards.learned': 'Learned',
  'flashcards.retention': 'Your retention',
  'flashcards.nextReview': 'Next review',
  'flashcards.nextReviewIn': 'in {{days}} days',
  'flashcards.rememberPhrase': 'Remember the phrase',
  'flashcards.ratingForgot': "Didn't know",
  'flashcards.axisToday': 'Today',
  'flashcards.axisPlus1': '+1d',
  'flashcards.axisPlus3': '+3d',
  'flashcards.axisPlus5': '+5d',
  'flashcards.axisPlus7': '+7d',
  'flashcards.axisPlus14': '+14d',
  'flashcards.axisPlus30': '+30d',

  // Planets
  'planets.audioModeEnglishOnly': 'English only',
  'planets.audioModeEnglishPause': 'English + pause',
  'planets.audioModeRandom': 'Random order',
  'planets.audioModeHardReview': 'Hard review',
  'planets.tapToListen': 'Tap play to listen',
  'planets.couldNotLoadAudio': 'Could not load audio',
  'planets.listening': 'Listening…',
  'planets.yourTurn': 'Your turn — repeat it now…',
  'planets.continuousAudio': 'Continuous audio',
  'planets.forTheCarOne': 'for the car · {{count}} sentence',
  'planets.forTheCarOther': 'for the car · {{count}} sentences',
  'planets.statSentences': 'Sentences',
  'planets.statListening': 'Listening',
  'planets.statFlashcards': 'Flashcards',
  'planets.statMastery': 'Mastery',
  'planets.unlockProgress': 'Unlock progress',
  'planets.yourProgress': 'Your progress',
  'planets.lessons': 'Lessons',
  'planets.hideAudio': 'Hide audio',
  'planets.listenInCar': 'Listen in the car',
  'planets.completed': 'Completed',
  'planets.continue': 'Continue',
  'planets.locked': 'Locked',
  'planets.noLessons': 'No lessons yet.',
  'planets.loadingLessons': 'Loading lessons…',
  'planets.planetComplete': 'Planet complete',
  'planets.continueLesson': 'Continue lesson {{position}}',
  'planets.back': 'Back',
  'planets.previousPlanet': 'Previous planet',
  'planets.nextPlanet': 'Next planet',
  'planets.traveling': 'Traveling to the planets…',
  'planets.planetTag': 'Planet {{number}}',
  'planets.pause': 'Pause',
  'planets.play': 'Play',

  // Chapter intro (shown before a lesson starts)
  'chapterIntro.chapter': 'Chapter {{position}}',
  'chapterIntro.lessonsLeftOne': '{{count}} lesson to the next chapter',
  'chapterIntro.lessonsLeftOther': '{{count}} lessons to the next chapter',
  'chapterIntro.start': 'Start the lesson',
  'chapterIntro.myWords': 'My words',
  'chapterIntro.livePractice': 'Live practice',

  // Language picker
  'languagePicker.title': 'Choose your language',
  'languagePicker.subtitle': 'You can change this later.',
  'languagePicker.iSpeak': 'I speak',
  'languagePicker.iWantToLearn': 'I want to learn',
  'languagePicker.continue': 'Continue',

  // Voice picker (Profile settings)
  'voicePicker.title': 'Tutor voice',
  'voicePicker.subtitle': 'Choose who teaches you',
  'voicePicker.female': 'Female voices',
  'voicePicker.male': 'Male voices',
  'voicePicker.speaks': 'Speaks {{language}}',
  'voicePicker.play': 'Play',
  'voicePicker.playing': 'Playing…',
  'voicePicker.previewNote': 'Preview plays a greeting in {{language}}',
  'voicePicker.done': 'Done',

  // Course overview (pre-login) — every figure comes from /api/planets/catalog
  'course.title': 'What you will learn',
  'course.eyebrow': 'THE HUPY METHOD',
  'course.body':
    'Every phrase is practiced out loud with your tutor, corrected in the moment, and brought back for review right before you would forget it.',
  'course.cta': 'Start learning',
  'course.statPlanets': 'Worlds',
  'course.statSentences': 'Phrases',
  'course.statLessons': 'Lessons',
  'course.loading': 'Loading the course…',
  'course.bubble': 'Speak from your very first lesson.',
  'course.stepSpeak': 'Speak it out loud',
  'course.stepSpeakBody': 'Live voice conversation, not multiple choice.',
  'course.stepCorrect': 'Get corrected instantly',
  'course.stepCorrectBody': 'Every mistake becomes a card you can review.',
  'course.stepReview': 'Review at the right time',
  'course.stepReviewBody': 'Spaced repetition schedules each phrase for you.',

  // Mic / voice-recognition permission modal
  'permissionModal.title': 'Your turn to speak!',
  'permissionModal.body': 'Turn on the Microphone and Speech Recognition so Hupy can correct your pronunciation.',
  'permissionModal.unlockMic': 'Enable microphone',
  'permissionModal.unlockSpeech': 'Enable speech recognition',

  // Voice (useVoiceConversation.ts)
  'voice.micPermissionTitle': 'Microphone access',
  'voice.micPermissionMessage': 'Huppy needs the microphone so you can practice speaking English.',
  'voice.micPermissionAllow': 'Allow',
  'voice.micPermissionDeny': 'Deny',
  'voice.micFailedToStart': 'Microphone failed to start. Check permissions.',
  'voice.micPermissionRequired':
    'Microphone permission is required to practice speaking. Enable it in Settings and try again.',
  'voice.couldNotStartSession': 'Could not start a session',
  'voice.connectionLost': 'Connection lost. Check your network and try again.',
  'voice.sessionEnded': 'The session ended unexpectedly.',
} as const;

/** The full string-value shape every locale dictionary must implement. */
export type Translations = Record<keyof typeof en, string>;
export type TranslationKey = keyof typeof en;
