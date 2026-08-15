// Shared jest setup: the native modules below throw outside a device, but
// several suites reach them through storage.ts. Mock them once here instead
// of copy-pasting factories into every test file.
//
// react-native-mmkv: in-memory stores, keyed by instance id — the plain and
// the encrypted instances are separate Maps exactly like the real library,
// so a test can't accidentally write a credential to the plain store.
jest.mock('react-native-mmkv', () => {
  // The backing stores live on globalThis so they survive jest.isolateModules
  // (which re-runs this factory into a fresh closure). Like real MMKV files,
  // the data is keyed by instance id and persists across module re-requires.
  if (!globalThis.__mmkvStores) globalThis.__mmkvStores = new Map();
  // Maps instance id -> the encryption key it was first opened with. The real
  // library throws when a file is opened with the wrong crypto key; the mock
  // mirrors that so storage tests can exercise the mismatch-recovery path.
  if (!globalThis.__mmkvKeys) globalThis.__mmkvKeys = new Map();
  const stores = globalThis.__mmkvStores;
  const keys = globalThis.__mmkvKeys;
  const makeInstance = (id) => {
    if (!stores.has(id)) stores.set(id, new Map());
    const store = stores.get(id);
    return {
      getString: (key) => store.get(key) ?? null,
      getBoolean: (key) => store.get(key) ?? null,
      getNumber: (key) => store.get(key) ?? null,
      getAllKeys: () => Array.from(store.keys()),
      contains: (key) => store.has(key),
      set: (key, value) => {
        store.set(key, value);
      },
      remove: (key) => {
        store.delete(key);
      },
    };
  };
  return {
    createMMKV: ({ id, encryptionKey }) => {
      const normalized = encryptionKey ?? null;
      if (keys.has(id) && keys.get(id) !== normalized) {
        throw new Error(`MMKV: crypto key mismatch for ${id}`);
      }
      keys.set(id, normalized);
      return makeInstance(id);
    },
    deleteMMKV: (id) => {
      stores.delete(id);
      keys.delete(id);
      return true;
    },
  };
});

// expo-secure-store: an in-memory Keychain. Storage tests can seed or clear
// values through the mock's module exports (getItemAsync/setItemAsync).
//
// The backing store lives on globalThis so it survives jest.isolateModules
// (which re-runs this factory into a fresh closure): a storage test that
// seeds a key through the real module instance and then re-requires storage
// in isolation must still see that key.
jest.mock('expo-secure-store', () => {
  if (!globalThis.__secureStoreValues) globalThis.__secureStoreValues = new Map();
  const values = globalThis.__secureStoreValues;
  const key = (options) => options?.keychainService ?? 'default';
  return {
    // The real module exports these as numeric constants; any number works.
    AFTER_FIRST_UNLOCK: 1,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
    ALWAYS: 3,
    WHEN_UNLOCKED: 4,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: jest.fn(async (name, options) => values.get(`${key(options)}:${name}`) ?? null),
    setItemAsync: jest.fn(async (name, value, options) => {
      values.set(`${key(options)}:${name}`, value);
    }),
    deleteItemAsync: jest.fn(async (name, options) => {
      values.delete(`${key(options)}:${name}`);
    }),
  };
});

// @react-native-google-signin/google-signin: the real module reaches for the
// RNGoogleSignin turbo module at import time and throws outside a device
// build, which would take down every suite that touches the auth store.
// Tests that exercise the Google flow override these per-test.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    // The default is a dismissed sheet: a test that wants a successful
    // sign-in must say so, so no test passes on an accidental success.
    signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
    signOut: jest.fn(async () => null),
  },
}));

// expo-crypto: deterministic random bytes so generated keys are stable in
// tests (asserted by value, not just shape).
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (count) => new Uint8Array(count).fill(0xab)),
}));
