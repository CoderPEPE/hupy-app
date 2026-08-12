import { create } from 'zustand';
import { getSecureStorage, SecureKeys, storage, StorageKeys } from '../storage';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { ApiError, setSessionExpiredHandler } from '../api/client';
import { localeForBaseLanguage, useI18nStore } from '../i18n';

type AuthState = {
  token: string | null;
  user: User | null;
  /** True once the persisted session has been checked against the backend. */
  initialized: boolean;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  /** Persists a course change (base, target) to the backend. */
  setLanguage: (language: string, baseLanguage?: string) => Promise<void>;
  /** Persists a tutor-voice choice (OpenAI voice id) to the backend. */
  setVoice: (voice: string) => Promise<void>;
  /** Persists the learner's display name to the backend. */
  setName: (name: string) => Promise<void>;
  signOut: () => void;
};

function readStoredUser(): User | null {
  const raw = getSecureStorage().getString(SecureKeys.authUser);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as User;
    // A user cached by an older build can be missing fields added since (it
    // rendered as "language.undefined" on the profile). Drop it and let
    // `restore()`'s /me call refill it rather than trusting the shape.
    if (!user?.id || !user.language || !user.base_language) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * The single place a loaded user is written down. The account is the source of
 * truth for the course *and* the interface language, so every path that
 * receives a user (restore, sign-in, sign-up, course/voice/name changes) funnels
 * through here — otherwise the three copies drift and the app renders in one
 * language while the server answers in another.
 */
function persistUser(user: User): void {
  getSecureStorage().set(SecureKeys.authUser, JSON.stringify(user));
  if (user.base_language) storage.set(StorageKeys.baseLanguage, user.base_language);
  storage.set(StorageKeys.targetLanguage, user.language);

  const locale = localeForBaseLanguage(user.base_language);
  const i18n = useI18nStore.getState();
  // Guarded: setting the same locale would re-render every screen for nothing.
  if (locale && locale !== i18n.locale) i18n.setLocale(locale);
}

/** The whole session is wiped: state, storage, and (fire-and-forget) the
 * server-side refresh token so it can't be replayed after logout. */
function clearSession(revokeServerSide: boolean): void {
  const refreshToken = getSecureStorage().getString(SecureKeys.refreshToken);
  if (revokeServerSide && refreshToken) {
    authApi.logout(refreshToken).catch(() => {
      // Best effort — the local session is gone regardless of what the
      // server says (offline logout must never fail the UI).
    });
  }
  getSecureStorage().remove(SecureKeys.authToken);
  getSecureStorage().remove(SecureKeys.refreshToken);
  getSecureStorage().remove(SecureKeys.authUser);
  useAuthStore.setState({ token: null, user: null });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Read lazily in restore(): the secure store is initialized asynchronously
  // at app start, after this module was created.
  token: null,
  user: null,
  initialized: false,

  restore: async () => {
    const token = getSecureStorage().getString(SecureKeys.authToken);
    if (!token) {
      set({ initialized: true });
      return;
    }
    set({ token });
    const storedUser = readStoredUser();
    if (storedUser) set({ user: storedUser });
    try {
      // me() goes through the client's 401 interceptor: an expired access
      // token is transparently refreshed (rotating the stored refresh
      // token) and the request retried. Only a dead refresh token reaches
      // this catch as 401.
      const user = await authApi.me();
      persistUser(user);
      set({ user, initialized: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Access AND refresh tokens are gone — the session cannot be
        // restored. (The interceptor already fired signOut on the refresh
        // failure; this branch is the fallback when the /me 401 was not
        // preempted, e.g. no refresh token was ever stored.)
        clearSession(false);
        set({ initialized: true });
      } else {
        // Network hiccup — keep the session and stored user.
        set({ initialized: true });
      }
    }
  },

  signIn: async (email, password) => {
    const { token, refreshToken, user } = await authApi.login(email, password);
    getSecureStorage().set(SecureKeys.authToken, token);
    getSecureStorage().set(SecureKeys.refreshToken, refreshToken);
    persistUser(user);
    set({ token, user });
  },

  signUp: async (email, password, name) => {
    // The (base, target) course chosen in the pre-login language picker
    // travels with the account; fall back to the backend defaults ('pt' → 'en').
    const baseLanguage = storage.getString(StorageKeys.baseLanguage) ?? undefined;
    const language = storage.getString(StorageKeys.targetLanguage) ?? undefined;
    const { token, refreshToken, user } = await authApi.register(
      email,
      password,
      baseLanguage,
      language,
      name?.trim(),
    );
    getSecureStorage().set(SecureKeys.authToken, token);
    getSecureStorage().set(SecureKeys.refreshToken, refreshToken);
    persistUser(user);
    set({ token, user });
  },

  /** Switches the learner's course on the backend — the ordered (base, target)
   * pair. Persists both sides so pre-login screens and TTS stay in sync. */
  setLanguage: async (language, baseLanguage) => {
    const user = await authApi.setLanguage(language, baseLanguage);
    persistUser(user);
    set({ user });
  },

  setVoice: async (voice) => {
    const user = await authApi.setVoice(voice);
    persistUser(user);
    storage.set(StorageKeys.tutorVoice, user.voice);
    set({ user });
  },

  setName: async (name) => {
    const user = await authApi.setName(name);
    persistUser(user);
    set({ user });
  },

  signOut: () => {
    clearSession(true);
  },
}));

// The client's 401 interceptor ends the session when the refresh token is
// rejected. Registering here keeps the circular import out of client.ts
// while guaranteeing one behavior everywhere: dead session = signOut.
setSessionExpiredHandler(() => {
  clearSession(false);
});
