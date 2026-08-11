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
} as const;
