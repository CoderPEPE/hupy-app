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
    const { token, user } = await authApi.register(email, password);
    storage.set(StorageKeys.authToken, token);
    storage.set(StorageKeys.authUser, JSON.stringify(user));
    set({ token, user });
  },

  signOut: () => {
    storage.remove(StorageKeys.authToken);
    storage.remove(StorageKeys.authUser);
    set({ token: null, user: null });
  },
}));
