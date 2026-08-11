import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'huppy-storage' });

export const StorageKeys = {
  authToken: 'auth.token',
  authUser: 'auth.user',
  locale: 'ui.locale',
  micPrimerSeen: 'ui.micPrimerSeen',
  /** Which language to learn: 'en' | 'es' | 'pt'. Picked pre-login and sent
   * on registration; changed post-login via the Profile language picker. */
  targetLanguage: 'ui.targetLanguage',
  /** The learner's own language (how the tutor explains): 'en' | 'es' | 'pt'.
   * Together with `targetLanguage` it forms the (base, target) course pair. */
  baseLanguage: 'ui.baseLanguage',
  /** Chosen tutor voice (OpenAI voice id); changed via the Profile voice
   * picker. Mirrors `user.voice` from the backend. */
  tutorVoice: 'ui.tutorVoice',
  /** Last level the celebration layer has acknowledged. Adopting it silently
   * on first sight means a level-up only celebrates when it actually happens
   * during a session — never on a fresh install or re-login. */
  lastLevel: 'gamification.lastLevel',
  /** Codes of achievements the celebration layer has already toasted (JSON
   * array), so an unlocked achievement never toasts twice. */
  seenAchievements: 'gamification.seenAchievements',
  /** Planet ids whose unlock the Planets screen has already celebrated (JSON
   * array). Planet ids are per-course, so switching courses celebrates the
   * new course's unlocks once each, which is the honest behavior. */
  celebratedUnlocks: 'planets.celebratedUnlocks',
} as const;
