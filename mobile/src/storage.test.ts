// The native modules are stubbed globally in jest.setup.js (in-memory maps,
// persisted on globalThis exactly like MMKV files persist on disk).
// This suite verifies the *policy* of the encrypted store: the AES key is
// generated once and persisted to the Keychain, credentials are only ever
// read/written through the encrypted instance, legacy plaintext credentials
// are migrated once, and misuse before init fails loudly.
//
// Every test drives a brand-new module instance (jest.isolateModules) so the
// module-level `secureStorage` starts uninitialized — the same state a fresh
// app process would be in. The underlying stores are shared, so "boot 2"
// scenarios work exactly like restarting the app.
import * as SecureStore from 'expo-secure-store';
import { SecureKeys } from './storage';

// The jest.setup.js expo-crypto mock fills bytes with 0xab, so a fresh key is
// deterministic: 64 chars of "ab".
const DETERMINISTIC_KEY = 'ab'.repeat(32);
const KEY_NAME = 'mmkv.encryption-key.v1';
const KEY_OPTIONS = { keychainService: 'com.conjuntos.huppy.secure-storage' };
const PLAIN_ID = 'huppy-storage';
const SECURE_ID = 'huppy-secure-storage';

/** A fresh module instance plus the SecureStore mock *it* imports. */
function freshStorage() {
  let mod: typeof import('./storage');
  let secureStore: typeof SecureStore;
  jest.isolateModules(() => {
    secureStore = require('expo-secure-store');
    mod = require('./storage');
  });
  return { mod: mod!, secureStore: secureStore! };
}

/** Direct access to the mock's per-id MMKV stores (simulates the files on disk). */
const mmkvMaps = () =>
  (globalThis as unknown as {
    __mmkvStores: Map<string, Map<string, unknown>>;
  }).__mmkvStores;

// The jest.mock factories for expo-secure-store are cached per file, so call
// history accumulates across isolated registries — clear it per test. The
// globalThis backing maps (the actual data) survive the clear.
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(async () => {
  // Wipe the persistent backing stores between tests (mirrors app reset).
  // __mmkvKeys too: the mismatch test records a different key for the secure
  // store, and a stale record would make a later test throw a spurious
  // "crypto key mismatch" on its fresh init.
  await SecureStore.deleteItemAsync(KEY_NAME, KEY_OPTIONS);
  const stores = (globalThis as unknown as {
    __mmkvStores: Map<string, Map<string, unknown>>;
    __mmkvKeys: Map<string, string | null>;
  }).__mmkvStores;
  (globalThis as unknown as { __mmkvKeys: Map<string, string | null> }).__mmkvKeys.clear();
  stores.get(PLAIN_ID)?.clear();
  stores.get(SECURE_ID)?.clear();
});

describe('initSecureStorage', () => {
  it('generates a device-bound key on first run and persists it', async () => {
    const fresh = freshStorage();

    await fresh.mod.initSecureStorage();

    const stored = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
    expect(stored).toBe(DETERMINISTIC_KEY);
    expect(fresh.mod.isSecureStorageReady()).toBe(true);
    // The key must be requested with the THIS_DEVICE_ONLY accessibility so it
    // never syncs off-device via iCloud Keychain, and it must only be
    // readable while unlocked (the app never touches tokens in the
    // background, so AFTER_FIRST_UNLOCK would be strictly weaker).
    expect(fresh.secureStore.setItemAsync).toHaveBeenCalledWith(
      KEY_NAME,
      DETERMINISTIC_KEY,
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  it('rotates to a fresh key when a reinstall leaves a stale key behind', async () => {
    const fresh = freshStorage();
    // iOS reinstall: the MMKV file is gone (uninstall deletes the app
    // container) but the Keychain item survived. A key exists, yet the store
    // it would encrypt is empty — it must not be reused.
    await SecureStore.setItemAsync(KEY_NAME, 'stale-key-0123456789abcdef', KEY_OPTIONS);

    await fresh.mod.initSecureStorage();

    // A brand-new key is generated, persisted, and used for the fresh store.
    expect(fresh.secureStore.setItemAsync).toHaveBeenCalledWith(
      KEY_NAME,
      DETERMINISTIC_KEY,
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
    const stored = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
    expect(stored).toBe(DETERMINISTIC_KEY);
    expect(fresh.mod.getSecureStorage().getString('huppy.secure.sentinel')).toBe(
      'huppy-encrypted-v1',
    );
  });

  it('keeps the current key once the store is intact', async () => {
    // Boot 1 with a seeded key: the empty store is stale (reinstall), so it
    // is rotated to a fresh key and the sentinel is written under it.
    await SecureStore.setItemAsync(KEY_NAME, 'steady-key-0123456789abcdef', KEY_OPTIONS);
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    boot1.mod.getSecureStorage().set(SecureKeys.authToken, 'signed-in');

    // Boot 2 (fresh module, same keychain + files): the sentinel matches, so
    // the current key must be reused — rotation is reserved for stale keys.
    const boot2 = freshStorage();
    await boot2.mod.initSecureStorage();

    // Only boot 1's rotation may rewrite the key (a write with the fresh-key
    // value); boot 2 must not re-key.
    const writes = (SecureStore.setItemAsync as jest.Mock).mock.calls.filter(
      ([name, value]) => name === KEY_NAME && value === DETERMINISTIC_KEY,
    );
    expect(writes).toHaveLength(1);
    expect(await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS)).toBe(DETERMINISTIC_KEY);
    expect(boot2.mod.getSecureStorage().getString(SecureKeys.authToken)).toBe('signed-in');
  });

  it('is idempotent under concurrent calls', async () => {
    const fresh = freshStorage();

    await Promise.all([
      fresh.mod.initSecureStorage(),
      fresh.mod.initSecureStorage(),
      fresh.mod.initSecureStorage(),
    ]);

    // Exactly one key write for a fresh install, and the same instance is
    // shared by all three callers.
    const writes = (fresh.secureStore.setItemAsync as jest.Mock).mock.calls.filter(
      ([name]) => name === KEY_NAME,
    );
    expect(writes).toHaveLength(1);
  });

  it('wipes the file and recovers when the keychain key no longer matches', async () => {
    // Boot 1 with key A: the file is opened and the sentinel + a token are
    // written under that key.
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    boot1.mod.getSecureStorage().set(SecureKeys.refreshToken, 'boot1-refresh');

    // The keychain item is replaced (device migration, keychain entitlement
    // change, restored backup) — key B no longer matches the on-disk file.
    await SecureStore.setItemAsync(KEY_NAME, 'key-b-0123456789abcdef', KEY_OPTIONS);

    // Boot 2: opening the file with key B throws (the mock mirrors the real
    // library); init must wipe the unrecoverable file, re-encrypt it under a
    // brand-new key (the stale key B is rotated away), and leave a usable
    // empty store.
    const boot2 = freshStorage();
    boot2.mod.storage.set('auth.token', 'legacy-2');
    await boot2.mod.initSecureStorage();

    const secure = boot2.mod.getSecureStorage();
    expect(secure.getString('huppy.secure.sentinel')).toBe('huppy-encrypted-v1');
    // Boot 1's ciphertext is unrecoverable and gone, not silently readable.
    expect(secure.getString(SecureKeys.refreshToken)).toBeNull();
    // The stale key B was replaced by a freshly generated one.
    expect(await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS)).toBe(DETERMINISTIC_KEY);
    // The store is usable: a legacy plaintext copy is migrated in.
    expect(secure.getString(SecureKeys.authToken)).toBe('legacy-2');
    expect(boot2.mod.storage.getString('auth.token')).toBeNull();
  });

  it('retries after a failed init (Keychain unavailable)', async () => {
    const fresh = freshStorage();
    // First attempt fails (SecureStore outage); init must reject and leave the
    // module uninitialized so a retry can succeed.
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keychain unavailable'),
    );
    await expect(fresh.mod.initSecureStorage()).rejects.toThrow('keychain unavailable');
    expect(fresh.mod.isSecureStorageReady()).toBe(false);

    // Retry succeeds and bootstraps the store.
    await fresh.mod.initSecureStorage();
    expect(fresh.mod.isSecureStorageReady()).toBe(true);
    expect(fresh.mod.getSecureStorage().getString('huppy.secure.sentinel')).toBe(
      'huppy-encrypted-v1',
    );
  });
});

describe('secure credential storage', () => {
  it('holds credentials in the encrypted instance, never the plain one', async () => {
    const fresh = freshStorage();
    await fresh.mod.initSecureStorage();

    fresh.mod.getSecureStorage().set(SecureKeys.authToken, 'token-secret');

    expect(fresh.mod.getSecureStorage().getString(SecureKeys.authToken)).toBe('token-secret');
    expect(fresh.mod.storage.getString(SecureKeys.authToken)).toBeNull();
  });

  it('throws a clear error when accessed before init', () => {
    const fresh = freshStorage();

    expect(fresh.mod.isSecureStorageReady()).toBe(false);
    expect(() => fresh.mod.getSecureStorage()).toThrow(/initSecureStorage/);
  });
});

describe('legacy plaintext migration', () => {
  it('moves plaintext credentials into the encrypted store once', async () => {
    const fresh = freshStorage();
    // Simulate a pre-encryption build: credentials sitting in the plain MMKV.
    fresh.mod.storage.set('auth.token', 'legacy-token');
    fresh.mod.storage.set('auth.refreshToken', 'legacy-refresh');
    fresh.mod.storage.set('auth.user', '{"id":"u1"}');

    await fresh.mod.initSecureStorage();

    const secure = fresh.mod.getSecureStorage();
    expect(secure.getString(SecureKeys.authToken)).toBe('legacy-token');
    expect(secure.getString(SecureKeys.refreshToken)).toBe('legacy-refresh');
    expect(secure.getString(SecureKeys.authUser)).toBe('{"id":"u1"}');
    // The plaintext copies are gone.
    expect(fresh.mod.storage.getString('auth.token')).toBeNull();
    expect(fresh.mod.storage.getString('auth.refreshToken')).toBeNull();
    expect(fresh.mod.storage.getString('auth.user')).toBeNull();
  });

  it('does not clobber credentials already in the encrypted store', async () => {
    // Boot 1: encrypted value exists (migration completed for this key).
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    boot1.mod.getSecureStorage().set(SecureKeys.authToken, 'current-token');
    // A stale plaintext copy lingers (restored backup / crash before remove).
    boot1.mod.storage.set('auth.token', 'stale-plaintext');

    // Boot 2 (fresh module, same persistent stores): the migration guard must
    // keep the encrypted value and only clean up the plaintext copy.
    const boot2 = freshStorage();
    await boot2.mod.initSecureStorage();

    expect(boot2.mod.getSecureStorage().getString(SecureKeys.authToken)).toBe('current-token');
    expect(boot2.mod.storage.getString('auth.token')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The manual re-key API is the opposite of the automatic rotation: it runs on
// a live, trusted store and must preserve everything in it while swapping the
// device-bound key underneath.
// ---------------------------------------------------------------------------
describe('manual re-key (rotateSecureStorageKey)', () => {
  it('re-encrypts the store under a fresh key while preserving credentials', async () => {
    const fresh = freshStorage();
    await fresh.mod.initSecureStorage();
    const secure = fresh.mod.getSecureStorage();
    secure.set(SecureKeys.authToken, 'token-1');
    secure.set(SecureKeys.refreshToken, 'refresh-1');
    secure.set(SecureKeys.authUser, '{"id":"u1"}');

    await fresh.mod.rotateSecureStorageKey();

    // Everything survived the re-encryption under the new key.
    const rotated = fresh.mod.getSecureStorage();
    expect(rotated.getString(SecureKeys.authToken)).toBe('token-1');
    expect(rotated.getString(SecureKeys.refreshToken)).toBe('refresh-1');
    expect(rotated.getString(SecureKeys.authUser)).toBe('{"id":"u1"}');
    expect(rotated.getString('huppy.secure.sentinel')).toBe('huppy-encrypted-v1');
    // A fresh key was genuinely persisted: the first-install persist plus the
    // manual re-key is exactly two re-key writes.
    const writes = (SecureStore.setItemAsync as jest.Mock).mock.calls.filter(
      ([name, value]: [string, string]) => name === KEY_NAME && value === DETERMINISTIC_KEY,
    );
    expect(writes).toHaveLength(2);
  });

  it('swaps in a brand-new store instance', async () => {
    const fresh = freshStorage();
    await fresh.mod.initSecureStorage();
    const before = fresh.mod.getSecureStorage();

    await fresh.mod.rotateSecureStorageKey();

    expect(fresh.mod.getSecureStorage()).not.toBe(before);
    expect(fresh.mod.getSecureStorage().getString('huppy.secure.sentinel')).toBe(
      'huppy-encrypted-v1',
    );
  });

  it('re-keys a signed-out store (sentinel only) without error', async () => {
    const fresh = freshStorage();
    await fresh.mod.initSecureStorage();

    await expect(fresh.mod.rotateSecureStorageKey()).resolves.toBeUndefined();

    expect(fresh.mod.getSecureStorage().getString('huppy.secure.sentinel')).toBe(
      'huppy-encrypted-v1',
    );
  });

  it('keeps the re-encrypted data readable across a restart', async () => {
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    boot1.mod.getSecureStorage().set(SecureKeys.authToken, 'token-1');
    await boot1.mod.rotateSecureStorageKey();

    // Boot 2 (fresh module, same keychain + files): the store opens with the
    // new key and the data is intact — no extra rotation needed.
    const boot2 = freshStorage();
    await boot2.mod.initSecureStorage();
    expect(boot2.mod.getSecureStorage().getString(SecureKeys.authToken)).toBe('token-1');
    expect(boot2.mod.getSecureStorage().getString('huppy.secure.sentinel')).toBe(
      'huppy-encrypted-v1',
    );
  });

  it('throws when called before init', async () => {
    const fresh = freshStorage();
    await expect(fresh.mod.rotateSecureStorageKey()).rejects.toThrow(/initSecureStorage/);
  });
});

// ---------------------------------------------------------------------------
// Key rotation is destructive by design: the sentinel is written before any
// credential, so a store that can't prove it is ours (missing sentinel) or is
// empty (reinstall) never gets its contents carried over. These tests pin the
// security property that credentials NEVER survive a rotation — no copy, no
// rescue, no fallback — while the app stays usable for a fresh login.
//
// Rotation is proven by the re-key WRITE, not the keychain value: the crypto
// mock fills bytes deterministically, so a "fresh" key is byte-identical to
// the old one and the stored value can't show a change. Only the
// `setItemAsync` call (which happens exclusively in the rotation path, never
// in the plain wipe path) distinguishes rotation from a same-key reset.
// ---------------------------------------------------------------------------
describe('key rotation security', () => {
  /** setItemAsync calls that persisted the fresh key (value === DETERMINISTIC_KEY). */
  const freshKeyWrites = () =>
    (SecureStore.setItemAsync as jest.Mock).mock.calls.filter(
      ([name, value]: [string, string]) => name === KEY_NAME && value === DETERMINISTIC_KEY,
    );

  const expectSignedOut = (secure: { getString: (k: string) => string | null | undefined }) => {
    expect(secure.getString(SecureKeys.authToken)).toBeNull();
    expect(secure.getString(SecureKeys.refreshToken)).toBeNull();
    expect(secure.getString(SecureKeys.authUser)).toBeNull();
  };

  it('destroys a signed-in user\'s credentials when rotation fires on reinstall', async () => {
    // Boot 1: a signed-in user with all three credentials in the encrypted store.
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    const secure1 = boot1.mod.getSecureStorage();
    secure1.set(SecureKeys.authToken, 'token-1');
    secure1.set(SecureKeys.refreshToken, 'refresh-1');
    secure1.set(SecureKeys.authUser, '{"id":"u1"}');

    // Reinstall: the MMKV file (app container) is deleted, the Keychain item
    // survives. Boot 2 must rotate to a fresh key — and the old credentials
    // must be gone, never re-read or resurrected.
    mmkvMaps().delete(SECURE_ID);
    const boot2 = freshStorage();
    await boot2.mod.initSecureStorage();

    const secure2 = boot2.mod.getSecureStorage();
    expect(secure2.getString('huppy.secure.sentinel')).toBe('huppy-encrypted-v1');
    expectSignedOut(secure2);
    // Boot 1's first-install persist + boot 2's rotation = exactly two re-key
    // writes: the rotation genuinely fired.
    expect(freshKeyWrites()).toHaveLength(2);
  });

  it('destroys the old ciphertext when rotation fires on a key mismatch', async () => {
    // Boot 1: signed-in user under the original key.
    const boot1 = freshStorage();
    await boot1.mod.initSecureStorage();
    const secure1 = boot1.mod.getSecureStorage();
    secure1.set(SecureKeys.authToken, 'token-1');
    secure1.set(SecureKeys.refreshToken, 'refresh-1');
    secure1.set(SecureKeys.authUser, '{"id":"u1"}');

    // The Keychain item is replaced (foreign backup restore, keychain wipe):
    // the on-disk file is now unreadable, so boot 2 rotates and must leave the
    // unrecoverable ciphertext behind — not silently readable.
    await SecureStore.setItemAsync(KEY_NAME, 'foreign-key-0123456789abcdef', KEY_OPTIONS);
    const boot2 = freshStorage();
    await boot2.mod.initSecureStorage();

    const secure2 = boot2.mod.getSecureStorage();
    expect(secure2.getString('huppy.secure.sentinel')).toBe('huppy-encrypted-v1');
    expectSignedOut(secure2);
    // Boot 1's persist + boot 2's rotation (the foreign seed is filtered out
    // by the value check): the stale key was rotated away, not kept.
    expect(freshKeyWrites()).toHaveLength(2);
  });

  it('never trusts a store that lacks the sentinel, even if it holds credentials', async () => {
    // Adversarial/tampered state: a file that contains credentials but no
    // sentinel (no proof it was created by this app). A stale key exists.
    mmkvMaps().set(
      SECURE_ID,
      new Map([
        ['auth.token', 'smuggled-token'],
        ['auth.refreshToken', 'smuggled-refresh'],
        ['auth.user', '{"id":"attacker"}'],
      ]),
    );
    await SecureStore.setItemAsync(KEY_NAME, 'stale-key-0123456789abcdef', KEY_OPTIONS);

    const fresh = freshStorage();
    await fresh.mod.initSecureStorage();

    // The smuggled data is destroyed, never copied into the rotated store.
    const secure = fresh.mod.getSecureStorage();
    expect(secure.getString('huppy.secure.sentinel')).toBe('huppy-encrypted-v1');
    expectSignedOut(secure);
    // Exactly one re-key write (the rotation; the stale-key seed is filtered
    // out): the smuggled store was wiped under a freshly persisted key.
    expect(freshKeyWrites()).toHaveLength(1);
  });
});
