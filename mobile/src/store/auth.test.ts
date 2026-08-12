import type { User } from '../types';
import { ApiError } from '../api/client';
import { useAuthStore } from './auth';
import { useI18nStore } from '../i18n';
import { storage, StorageKeys } from '../storage';

// react-native-mmkv is stubbed globally in jest.setup.js.

// --- Mocks ---------------------------------------------------------------

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  me: jest.fn(),
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
  [StorageKeys.authToken, StorageKeys.authUser, StorageKeys.baseLanguage, StorageKeys.targetLanguage, StorageKeys.tutorVoice].forEach(
    (k) => storage.remove(k),
  );
};

const resetStore = () =>
  useAuthStore.setState({
    token: null,
    user: null,
    initialized: false,
  });

beforeEach(() => {
  jest.clearAllMocks();
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
    storage.set(StorageKeys.authToken, 'token-1');
    const me = mockApi<() => Promise<User>>(authApi.me).mockResolvedValue(user({ name: 'Ana' }));

    resetStore();
    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(me).toHaveBeenCalled();
    expect(useAuthStore.getState().user?.name).toBe('Ana');
    expect(useAuthStore.getState().initialized).toBe(true);
  });

  it('persists the refreshed user to storage', async () => {
    storage.set(StorageKeys.authToken, 'token-1');
    mockApi<() => Promise<User>>(authApi.me).mockResolvedValue(user({ name: 'Ana' }));

    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(JSON.parse(storage.getString(StorageKeys.authUser) ?? '{}')).toMatchObject({ name: 'Ana' });
  });

  it('clears the session on a 401', async () => {
    storage.set(StorageKeys.authToken, 'stale-token');
    storage.set(StorageKeys.authUser, JSON.stringify(user()));
    mockApi<() => Promise<User>>(authApi.me).mockRejectedValue(new ApiError(401, 'expired'));

    useAuthStore.setState({ token: 'stale-token', user: user() });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, initialized: true });
    expect(storage.getString(StorageKeys.authToken)).toBeNull();
    expect(storage.getString(StorageKeys.authUser)).toBeNull();
  });

  it('keeps the session on a network failure', async () => {
    storage.set(StorageKeys.authToken, 'token-1');
    mockApi<() => Promise<User>>(authApi.me).mockRejectedValue(new ApiError(0, 'network'));

    useAuthStore.setState({ token: 'token-1' });
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().initialized).toBe(true);
    expect(useAuthStore.getState().token).toBe('token-1');
  });
});

// --- signIn / signUp -----------------------------------------------------

describe('signIn', () => {
  it('stores the token, user, and course languages', async () => {
    const { token, user: u } = { token: 'token-new', user: user({ base_language: 'en', language: 'es' }) };
    mockApi<() => Promise<{ token: string; user: User }>>(authApi.login).mockResolvedValue({ token, user: u });

    await useAuthStore.getState().signIn('ana@example.com', 'password123');

    expect(storage.getString(StorageKeys.authToken)).toBe('token-new');
    expect(storage.getString(StorageKeys.baseLanguage)).toBe('en');
    expect(storage.getString(StorageKeys.targetLanguage)).toBe('es');
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });
});

describe('signUp', () => {
  it('passes the stored course pair to registration', async () => {
    storage.set(StorageKeys.baseLanguage, 'es');
    storage.set(StorageKeys.targetLanguage, 'pt');
    mockApi<() => Promise<{ token: string; user: User }>>(authApi.register).mockResolvedValue({
      token: 'token-reg',
      user: user({ base_language: 'es', language: 'pt', name: 'Ana' }),
    });

    await useAuthStore.getState().signUp('ana@example.com', 'password123', 'Ana');

    expect(authApi.register).toHaveBeenCalledWith('ana@example.com', 'password123', 'es', 'pt', 'Ana');
    expect(useAuthStore.getState().token).toBe('token-reg');
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
  it('clears the token, user, and storage', () => {
    storage.set(StorageKeys.authToken, 'token-1');
    storage.set(StorageKeys.authUser, JSON.stringify(user()));
    useAuthStore.setState({ token: 'token-1', user: user() });

    useAuthStore.getState().signOut();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(storage.getString(StorageKeys.authToken)).toBeNull();
    expect(storage.getString(StorageKeys.authUser)).toBeNull();
  });
});
