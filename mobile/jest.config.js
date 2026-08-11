module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // Based on jest-expo's own preset pattern (which whitelists `.pnpm` itself
  // so pnpm's nested node_modules/.pnpm/<pkg>/node_modules/<pkg> layout still
  // gets transformed), extended with this project's extra native packages.
  transformIgnorePatterns: [
    '/node_modules/(?!(\\.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|react-native-svg|react-native-mmkv|@siteed/audio-studio|react-native-audio-api))',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
