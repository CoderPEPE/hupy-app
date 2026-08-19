import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useT } from '../i18n';
import { colors, radius, shadows } from '../theme';

export function GoogleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.9 29.6 5 24 5c-7.7 0-14.4 4.3-17.7 9.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-1.9 14.1-5.1l-6.5-5.5c-2 1.4-4.6 2.3-7.6 2.3-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.5 5.5C41.6 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </Svg>
  );
}

export function AppleMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 384 512">
      <Path
        fill="#000000"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 8 184.8 8 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 37.6 59 129.3 107.2 127.8 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-84.1 102.6-121.8-65.2-30.7-65.7-90-65.7-91.9zM254.3 88.1c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </Svg>
  );
}

function FacebookMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill="#1877F2" />
      <Path
        fill="#FFFFFF"
        d="M15.1 12.9h-2v7.9h-3.3v-7.9H8.1V10h1.7V8.5c0-1.7 1-3.3 3.6-3.3h2.6v2.8h-1.9c-.3 0-.7.2-.7.8V10h2.7l-.3 2.9z"
      />
    </Svg>
  );
}

type Provider = 'google' | 'apple' | 'facebook';

const MARKS: Record<Provider, (size: number) => React.ReactNode> = {
  google: (size) => <GoogleMark size={size} />,
  apple: (size) => <AppleMark size={size} />,
  facebook: (size) => <FacebookMark size={size} />,
};

/** "Continue with Google / Apple / Facebook" row of circular icon buttons. */
export function SocialAuthRow({
  onPress,
  providers = ['google', 'apple', 'facebook'],
}: {
  onPress?: (provider: Provider) => void;
  providers?: Provider[];
}) {
  const t = useT();
  return (
    <View style={styles.row}>
      {providers.map((p) => (
        <Pressable
          key={p}
          style={styles.button}
          onPress={() => onPress?.(p)}
          accessibilityRole="button"
          accessibilityLabel={t('auth.login.continueWithProvider', {
            provider: p.charAt(0).toUpperCase() + p.slice(1),
          })}
        >
          {MARKS[p](18)}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
});
