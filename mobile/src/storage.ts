import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'huppy-storage' });

export const StorageKeys = {
  authToken: 'auth.token',
  authUser: 'auth.user',
  locale: 'ui.locale',
  micPrimerSeen: 'ui.micPrimerSeen',
  /** Which course to learn: 'en' | 'es' | 'pt'. Picked pre-login and sent on
   * registration; changed post-login via the Profile language picker. */
  targetLanguage: 'ui.targetLanguage',
  /** Chosen tutor voice (OpenAI voice id); changed via the Profile voice
   * picker. Mirrors `user.voice` from the backend. */
  tutorVoice: 'ui.tutorVoice',
} as const;
