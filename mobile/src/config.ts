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

/**
 * Google Sign-In OAuth client IDs. Not secrets — every OAuth client ID is
 * shipped inside the app binary by definition; the security boundary is the
 * backend checking the ID token's `aud` against its own allowlist.
 *
 * `webClientId` is what makes Google return an ID token at all, so an empty
 * value means the Google button cannot work. The iOS client ID is also
 * written (in reversed form) into app.json's `iosUrlScheme` — the two must
 * name the same OAuth client or iOS sign-in fails at the redirect.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
