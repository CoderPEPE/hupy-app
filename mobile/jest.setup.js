// Shared jest setup: react-native-mmkv is a native module that throws outside
// a device, but several suites reach it through storage.ts. Stub it with an
// in-memory Map once here instead of copy-pasting the factory into every test
// file (it was previously duplicated in client.test.ts, auth.test.ts and
// ttsPlayer.test.ts).
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: () => ({
      getString: (key) => store.get(key) ?? null,
      set: (key, value) => {
        store.set(key, value);
      },
      remove: (key) => {
        store.delete(key);
      },
    }),
  };
});
