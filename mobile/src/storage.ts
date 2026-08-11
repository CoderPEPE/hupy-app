import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'huppy-storage' });

export const StorageKeys = {
  authToken: 'auth.token',
  authUser: 'auth.user',
  locale: 'ui.locale',
} as const;
