import type { User } from '../types';
import { ApiError } from '../api/client';
import { useAuthStore } from './auth';
import { useI18nStore } from '../i18n';
import { getSecureStorage, initSecureStorage, SecureKeys, storage, StorageKeys } from '../storage';

// react-native-mmkv is stubbed globally in jest.setup.js.

// --- Mocks ---------------------------------------------------------------

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  me: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
  setLanguage: jest.fn(),
  setVoice: jest.fn(),
  setName: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const authApi = require('../api/auth') as Record<string, jest.Mock>;
const mockApi = <T extends (...args: never[]) => unknown>(fn: jest.Mock): jest.MockedFunction<T> =>
  fn as unknown as jest.MockedFunction<T>;

// --- Fixtures ------------------------------------------------------------

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'ana@example.com',
  created_at: '2026-01-01T00:00:00Z',
  name: '',
  base_language: 'pt',
  language: 'en',
  voice: '',
  ...overrides,
});

const resetStorage = () => {
  [StorageKeys.baseLanguage, StorageKeys.targetLanguage, StorageKeys.tutorVoice].forEach((k) =>
    storage.remove(k),
  );
  const secure = getSecureStorage();
  [SecureKeys.authToken, SecureKeys.refreshToken, SecureKeys.authUser].forEach((k) =>
    secure.remove(k),
  );
};

const resetStore = () =>
  useAuthStore.setState({
    token: null,
    user: null,
    initialized: false,
  });

beforeEach(async () => {
  jest.clearAllMocks();
  // The store reads credentials from the encrypted MMKV; boot it like App.tsx
  // does (its mock in jest.setup.js is deterministic).
  await initSecureStorage();
  resetStorage();
  resetStore();
  // persistUser() also switches the module-level i18n locale (and writes
  // ui.locale to storage); reset it so one test's signIn can't bleed its
  // language into the next.
  storage.remove(StorageKeys.locale);
  useI18nStore.setState({ locale: 'en' });
});

// --- restore -------------------------------------------------------------

describe('restore', () => {
  it('marks initialized with no token and no user', async () => {
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, initialized: true });
  });

  it('refreshes the stored user from the backend when a token exists', async () => {
    getSecureStorage().set(SecureKeys.authToken, 'token-1');
    const me = mockApi<() => Promise<User>>(authApi.me).mockResolvedValue(user({ name: 'Ana' }));

    resetStore();
    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(me).toHaveBeenCalled();
    expect(useAuthStore.getState().user?.name).toBe('Ana');
    expect(useAuthStore.getState().initialized).toBe(true);
  });

  it('persists the refreshed user to storage', async () => {
    getSecureStorage().set(SecureKeys.authToken, 'token-1');
    mockApi<() => Promise<User>>(authApi.me).mockResolvedValue(user({ name: 'Ana' }));

    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(JSON.parse(getSecureStorage().getString(SecureKeys.authUser) ?? '{}')).toMatchObject({
      name: 'Ana',
    });
  });

  it('clears the session on a 401', async () => {
    getSecureStorage().set(SecureKeys.authToken, 'stale-token');
    getSecureStorage().set(SecureKeys.refreshToken, 'refresh-1');
    getSecureStorage().set(SecureKeys.authUser, JSON.stringify(user()));
    mockApi<() => Promise<User>>(authApi.me).mockRejectedValue(new ApiError(401, 'expired'));

    useAuthStore.setState({ token: 'stale-token', user: user() });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, initialized: true });
    expect(getSecureStorage().getString(SecureKeys.authToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.authUser)).toBeNull();
  });

  it('keeps the session on a network failure', async () => {
    getSecureStorage().set(SecureKeys.authToken, 'token-1');
    mockApi<() => Promise<User>>(authApi.me).mockRejectedValue(new ApiError(0, 'network'));

    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().initialized).toBe(true);
    expect(useAuthStore.getState().token).toBe('token-1');
  });
});

// --- signIn / signUp -----------------------------------------------------

/** The auth response exactly as the server sends it — snake_case
 * `refresh_token`. The mock previously used camelCase, which typechecked
 * against a wrong type and hid a real login crash, so this shape is shared
 * and must stay in step with the backend's `AuthResponse`. */
type WireAuthResponse = { token: string; refresh_token: string; user: User };

describe('signIn', () => {
  it('stores the token pair, user, and course languages', async () => {
    mockApi<() => Promise<WireAuthResponse>>(authApi.login).mockResolvedValue({
      token: 'token-new',
      refresh_token: 'refresh-new',
      user: user({ base_language: 'en', language: 'es' }),
    });

    await useAuthStore.getState().signIn('ana@example.com', 'password123');

    expect(getSecureStorage().getString(SecureKeys.authToken)).toBe('token-new');
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBe('refresh-new');
    // Credentials must live in the encrypted store, never the plain one.
    expect(storage.getString(SecureKeys.authToken)).toBeNull();
    expect(storage.getString(StorageKeys.baseLanguage)).toBe('en');
    expect(storage.getString(StorageKeys.targetLanguage)).toBe('es');
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });

  /// Regression: reading the refresh token under the wrong key handed
  /// `undefined` to MMKV, which surfaced to the user as a raw C++ variant
  /// error under the password field instead of a login failure.
  it('fails with a readable error when the response has no refresh token', async () => {
    mockApi<() => Promise<unknown>>(authApi.login).mockResolvedValue({
      token: 'token-new',
      user: user(),
    });

    await expect(useAuthStore.getState().signIn('ana@example.com', 'password123')).rejects.toThrow(
      /valid session/i,
    );
    // Nothing half-written: a failed sign-in leaves no session behind.
    expect(getSecureStorage().getString(SecureKeys.authToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });
});

describe('signUp', () => {
  it('passes the stored course pair to registration and stores the pair', async () => {
    storage.set(StorageKeys.baseLanguage, 'es');
    storage.set(StorageKeys.targetLanguage, 'pt');
    mockApi<() => Promise<WireAuthResponse>>(authApi.register).mockResolvedValue({
      token: 'token-reg',
      refresh_token: 'refresh-reg',
      user: user({ base_language: 'es', language: 'pt', name: 'Ana' }),
    });

    await useAuthStore.getState().signUp('ana@example.com', 'password123', 'Ana');

    expect(authApi.register).toHaveBeenCalledWith('ana@example.com', 'password123', 'es', 'pt', 'Ana');
    expect(useAuthStore.getState().token).toBe('token-reg');
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBe('refresh-reg');
  });
});

// --- settings ------------------------------------------------------------

describe('setLanguage / setVoice / setName', () => {
  it('setLanguage persists the new course', async () => {
    mockApi<() => Promise<User>>(authApi.setLanguage).mockResolvedValue(user({ base_language: 'en', language: 'en' }));
    await useAuthStore.getState().setLanguage('en', 'en');
    expect(storage.getString(StorageKeys.baseLanguage)).toBe('en');
    expect(useAuthStore.getState().user?.language).toBe('en');
  });

  it('setVoice persists the tutor voice', async () => {
    mockApi<() => Promise<User>>(authApi.setVoice).mockResolvedValue(user({ voice: 'onyx' }));
    await useAuthStore.getState().setVoice('onyx');
    expect(storage.getString(StorageKeys.tutorVoice)).toBe('onyx');
  });

  it('setName updates the display name', async () => {
    mockApi<() => Promise<User>>(authApi.setName).mockResolvedValue(user({ name: 'Ana Paula' }));
    await useAuthStore.getState().setName('Ana Paula');
    expect(useAuthStore.getState().user?.name).toBe('Ana Paula');
  });
});

// --- signOut -------------------------------------------------------------

describe('signOut', () => {
  it('clears the token pair, user, and storage', () => {
    getSecureStorage().set(SecureKeys.authToken, 'token-1');
    getSecureStorage().set(SecureKeys.refreshToken, 'refresh-1');
    getSecureStorage().set(SecureKeys.authUser, JSON.stringify(user()));
    useAuthStore.setState({ token: 'token-1', user: user() });

    useAuthStore.getState().signOut();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.authToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.refreshToken)).toBeNull();
    expect(getSecureStorage().getString(SecureKeys.authUser)).toBeNull();
  });

  it('revokes the refresh token server-side, best-effort', () => {
    getSecureStorage().set(SecureKeys.refreshToken, 'refresh-1');
    mockApi<(t: string) => Promise<void>>(authApi.logout).mockRejectedValue(new ApiError(0, 'offline'));

    // Must not throw — offline logout clears locally and moves on.
    useAuthStore.getState().signOut();

    expect(authApi.logout).toHaveBeenCalledWith('refresh-1');
    expect(useAuthStore.getState().token).toBeNull();
  });
});
