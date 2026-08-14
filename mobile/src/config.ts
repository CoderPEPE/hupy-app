import { Platform } from 'react-native';

// Android emulators reach the host machine via 10.0.2.2; iOS simulator via localhost.
// When testing on a physical device, replace this with your computer's LAN IP,
// e.g. 'http://192.168.1.20:3000'.
const DEV_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000',
});

/**
 * In production builds, set EXPO_PUBLIC_API_URL to the HTTPS backend URL
 * (e.g. https://api.hupy.example.com). Expo inlines EXPO_PUBLIC_* variables
 * at bundle time, so this needs a rebuild after changing it.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEV_BASE_URL;
