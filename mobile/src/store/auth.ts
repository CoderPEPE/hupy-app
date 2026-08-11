import { create } from 'zustand';
import { storage, StorageKeys } from '../storage';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

type AuthState = {
  token: string | null;
  user: User | null;
  /** True once the persisted session has been checked against the backend. */
  initialized: boolean;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  /** Persists a course change ('en' | 'es' | 'pt') to the backend. */
  setLanguage: (language: string) => Promise<void>;
  /** Persists a tutor-voice choice (OpenAI voice id) to the backend. */
  setVoice: (voice: string) => Promise<void>;
  signOut: () => void;
};

function readStoredUser(): User | null {
  const raw = storage.getString(StorageKeys.authUser);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: storage.getString(StorageKeys.authToken) ?? null,
  user: readStoredUser(),
  initialized: false,

  restore: async () => {
    const token = get().token;
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, initialized: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Token is invalid or expired — clear the session.
        storage.remove(StorageKeys.authToken);
        storage.remove(StorageKeys.authUser);
        set({ token: null, user: null, initialized: true });
      } else {
        // Network hiccup — keep the session and stored user.
        set({ initialized: true });
      }
    }
  },

  signIn: async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    storage.set(StorageKeys.authToken, token);
    storage.set(StorageKeys.authUser, JSON.stringify(user));
    set({ token, user });
  },

  signUp: async (email, password) => {
    // The course chosen in the pre-login language picker travels with the
    // account; fall back to the backend default ('en').
    const language = storage.getString(StorageKeys.targetLanguage) ?? undefined;
    const { token, user } = await authApi.register(email, password, language);
    storage.set(StorageKeys.authToken, token);
    storage.set(StorageKeys.authUser, JSON.stringify(user));
    set({ token, user });
  },

  setLanguage: async (language) => {
    const user = await authApi.setLanguage(language);
    storage.set(StorageKeys.authUser, JSON.stringify(user));
    storage.set(StorageKeys.targetLanguage, user.language);
    set({ user });
  },

  setVoice: async (voice) => {
    const user = await authApi.setVoice(voice);
    storage.set(StorageKeys.authUser, JSON.stringify(user));
    storage.set(StorageKeys.tutorVoice, user.voice);
    set({ user });
  },

  signOut: () => {
    storage.remove(StorageKeys.authToken);
    storage.remove(StorageKeys.authUser);
    set({ token: null, user: null });
  },
}));
