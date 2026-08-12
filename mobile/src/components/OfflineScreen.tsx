import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { colors, spacing, typography } from '../theme';
import { Mascot } from './Mascot';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  /** True while a re-check is in flight (spinner on the retry button). */
  retrying?: boolean;
  onRetry: () => void;
};

/**
 * Full-screen state shown while the backend is unreachable. Everything the
 * app does lives on the server (tutor, planets, cards), so the whole UI is
 * replaced rather than letting screens fail one request at a time. It clears
 * itself automatically when the connection comes back — see useConnectivity.
 */
export function OfflineScreen({ retrying = false, onRetry }: Props) {
  const t = useT();
  // Full-screen view rendered above the navigator, so it must handle the
  // notches and home indicator itself rather than relying on a screen's
  // safe-area context.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Mascot size={104} />
        <Text style={styles.title}>{t('offline.title')}</Text>
        <Text style={styles.body}>{t('offline.body')}</Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton title={t('offline.retry')} onPress={onRetry} loading={retrying} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.lg,
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    paddingBottom: spacing.xxl,
    alignSelf: 'stretch',
  },
});
