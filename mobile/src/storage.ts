import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV, deleteMMKV, type MMKV } from 'react-native-mmkv';

/**
 * Plain MMKV for non-sensitive UI state (locale, course prefs, celebration
 * flags, tutor voice). Never holds credentials — those live in the
 * encrypted instance below.
 */
export const storage = createMMKV({ id: 'hupy-storage' });

/**
 * Credential keys, stored ONLY in the encrypted MMKV. Keeping them out of
 * `StorageKeys` makes the security boundary structural: the only way to
 * touch these is through `getSecureStorage()`.
 */
export const SecureKeys = {
  authToken: 'auth.token',
  /** Rotating refresh token exchanged for fresh access JWTs at
   * `/api/auth/refresh`. Only the server can validate it; this value is the
   * last-issued raw token, which is single-use on the server. */
  refreshToken: 'auth.refreshToken',
  /** The serialized signed-in user (email, name, course). */
  authUser: 'auth.user',
} as const;

export const StorageKeys = {
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

// ---------------------------------------------------------------------------
// Encrypted credential storage
// ---------------------------------------------------------------------------

const SECURE_STORAGE_ID = 'hupy-secure-storage';
// The Keychain service isolates the key from any other app's keychain items.
const KEYCHAIN_SERVICE = 'com.hupy.hupy.secure-storage';
const KEYCHAIN_KEY = 'mmkv.encryption-key.v1';
// Read options share the service; write options additionally pin the
// accessibility so the key never syncs off-device and is only readable while
// unlocked (the app only ever touches tokens in the foreground).
const KEYCHAIN_OPTIONS = { keychainService: KEYCHAIN_SERVICE };
const KEYCHAIN_WRITE_OPTIONS = {
  keychainService: KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
// iOS keychain access group, declared in app.json (`ios.entitlements`:
// keychain-access-groups -> $(AppIdentifierPrefix)com.hupy.hupy).
//
// We deliberately do NOT pass `accessGroup` to expo-secure-store: the macro
// is only expanded at build time, and the runtime option needs the resolved
// TeamID-prefixed value, which JS can't know. Leaving it unset is correct
// because the entitlement's FIRST entry becomes the app's default access
// group (Apple: the effective list is [keychain-access-groups] +
// [application-identifier] + [app groups], first entry wins) — and since the
// entitlement resolves to exactly the application-identifier group the app
// already used by default (TeamID.com.hupy.hupy), existing items stay
// in place across the upgrade.
//
// Why pin it at all: the group is now explicit, so it survives signing
// changes within the same team (dev / ad-hoc / TestFlight / App Store cert
// or profile rotation) and stays stable even if the bundle identifier ever
// changes. Only a team change (different AppIdentifierPrefix) moves keychain
// items, and no entitlement can bridge that — iOS forbids it by design.
// Written into the encrypted store at creation; a read that doesn't return it
// means the key and the file disagree, so the file is unrecoverable garbage.
const SENTINEL_KEY = 'hupy.secure.sentinel';
const SENTINEL_VALUE = 'hupy-encrypted-v1';

let secureStorage: MMKV | null = null;
let secureInitPromise: Promise<void> | null = null;

/** The encrypted credential store. Throws if called before
 * [`initSecureStorage`] completed — misuse is a programming error and should
 * fail loudly, not silently store credentials in plaintext. */
export function getSecureStorage(): MMKV {
  if (!secureStorage) {
    throw new Error('getSecureStorage() called before initSecureStorage()');
  }
  return secureStorage;
}

/** True once the encrypted store is usable (init succeeded). */
export function isSecureStorageReady(): boolean {
  return secureStorage !== null;
}

/**
 * Explicitly re-keys the encrypted store: every stored value is re-encrypted
 * under a brand-new device-bound key, and the old key is rotated out of the
 * Keychain. Unlike the automatic rotation (which only fires when init meets a
 * stale key), this preserves the current contents — a signed-in user stays
 * signed in — so support tooling can force a re-key at any time (e.g. after a
 * suspected device-secret exposure) without waiting for a reinstall.
 *
 * Requires [`initSecureStorage`] to have completed. The new key is persisted
 * first; the snapshot + swap then run as one synchronous block with no awaits
 * in between, so no concurrent reader or writer can observe a half-rotated
 * store. If the rebuild ever throws (e.g. createMMKV fails), the keychain
 * already holds the new key and the old file is gone — the function rejects
 * and the store is unusable until the next boot, which detects the mismatch
 * and self-heals.
 */
export async function rotateSecureStorageKey(): Promise<void> {
  if (!secureStorage) {
    throw new Error('rotateSecureStorageKey() called before initSecureStorage()');
  }
  const newKey = await freshKey();
  // Snapshot + swap run synchronously with no awaits in between: any write
  // that landed before the new key was persisted is captured here, the
  // snapshot reads the still-valid old file, and nothing can interleave after
  // it is deleted.
  const entries: Array<[string, string]> = [];
  for (const key of secureStorage.getAllKeys()) {
    const value = secureStorage.getString(key);
    if (value != null) entries.push([key, value]);
  }
  const next = recreateWith(newKey);
  for (const [key, value] of entries) next.set(key, value);
  secureStorage = next;
}

/**
 * Boots the encrypted credential store. Called once at app start, before
 * anything reads a token: loads the device-bound AES key from the Keychain
 * (iOS) / Keystore (Android), generating and persisting it on first run, then
 * opens the encrypted MMKV file with it.
 *
 * Stale-key rotation: an MMKV file lives in the app container and is deleted
 * on uninstall, but the iOS Keychain item can survive it — so a reinstall
 * boots with a key and an empty store. Init treats any pre-existing key that
 * can't open an intact store as stale and rotates it (fresh key persisted,
 * store re-encrypted under it). The same path covers a key/file mismatch
 * (e.g. a restored backup kept the MMKV file but not the Keychain item): the
 * old ciphertext is unrecoverable, the store is wiped, and the user simply
 * logs in again. This is the correct failure mode for a device-bound key:
 * losing the device credential means losing the session, never silently
 * downgrading to plaintext, and never reusing a key that predates the
 * current install.
 */
export function initSecureStorage(): Promise<void> {
  if (secureStorage) return Promise.resolve();
  // Single-flight: React effects and tests may call this concurrently.
  if (!secureInitPromise) {
    secureInitPromise = initSecureStorageInner().finally(() => {
      secureInitPromise = null;
    });
  }
  return secureInitPromise;
}

async function initSecureStorageInner(): Promise<void> {
  // Load the existing key; on a fresh install (no key at all) generate and
  // persist one. `hadKey` remembers which case we're in, so a pre-existing
  // key that turns out to be stale can be rotated below.
  const existing = await SecureStore.getItemAsync(KEYCHAIN_KEY, KEYCHAIN_OPTIONS);
  const hadKey = existing != null;
  let key = existing ?? (await freshKey());

  // Re-encrypt with a fresh key whenever a pre-existing key turns out to be
  // stale. That is the signature of a reinstall: the MMKV file lives in the
  // app container and is deleted on uninstall, but the iOS Keychain item can
  // survive it, so init comes back with a key and an empty store. It also
  // covers a key/file mismatch (the on-disk file can't be opened with the
  // key at all). In both cases the old ciphertext is unrecoverable, so the
  // fresh store is encrypted under a brand-new key rather than the stale one
  // — a reinstall never reuses a key that predates it.
  const rotateIfStaleKey = async (): Promise<string> => (hadKey ? freshKey() : key);

  // Build into a local and commit `secureStorage` only once the whole
  // open/wipe dance has succeeded: if any createMMKV below throws, the module
  // must stay uninitialized (null) so a retry of initSecureStorage() actually
  // re-runs instead of early-returning on a stale half-built instance.
  let instance: MMKV;
  try {
    instance = createMMKV({ id: SECURE_STORAGE_ID, encryptionKey: key });
    if (instance.getString(SENTINEL_KEY) !== SENTINEL_VALUE) {
      // Fresh/empty file, or a key/file mismatch (MMKV may open it as empty
      // instead of throwing). Either way the old key is stale — rotate, then
      // wipe and start clean under the fresh key.
      key = await rotateIfStaleKey();
      instance = recreateWith(key);
    }
  } catch {
    // createMMKV threw (wrong key on an existing file). Same recovery, and
    // the existing key is stale by definition — rotate it too.
    key = await rotateIfStaleKey();
    instance = recreateWith(key);
  }
  secureStorage = instance;

  migrateLegacyCredentials();
}

/** One-time upgrade from the pre-encryption build: move any credentials left
 * in the plain MMKV into the encrypted store, then delete the plaintext
 * copies. Idempotent — once the plain copies are gone there is nothing left
 * to move. */
function migrateLegacyCredentials(): void {
  const target = getSecureStorage();
  let moved = false;
  for (const [legacyKey, secureKey] of [
    ['auth.token', SecureKeys.authToken],
    ['auth.refreshToken', SecureKeys.refreshToken],
    ['auth.user', SecureKeys.authUser],
  ] as const) {
    const value = storage.getString(legacyKey);
    if (value != null && target.getString(secureKey) == null) {
      target.set(secureKey, value);
      moved = true;
    }
    storage.remove(legacyKey);
  }
  if (moved) {
    console.info('[storage] migrated credentials to the encrypted store');
  }
}

/** Generate a brand-new encryption key and persist it to the Keychain. */
async function freshKey(): Promise<string> {
  const fresh = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(KEYCHAIN_KEY, fresh, KEYCHAIN_WRITE_OPTIONS);
  return fresh;
}

/** Wipe the encrypted store file and start clean under `encryptionKey`. */
function recreateWith(encryptionKey: string): MMKV {
  deleteMMKV(SECURE_STORAGE_ID);
  const instance = createMMKV({ id: SECURE_STORAGE_ID, encryptionKey });
  instance.set(SENTINEL_KEY, SENTINEL_VALUE);
  return instance;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
