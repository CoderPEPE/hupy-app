import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useI18nStore, useT } from '../i18n';
import { colors, radius } from '../theme';

/** Toggles between English and Brazilian Portuguese. One tap cycles the pair —
 * there are only two supported locales, so a picker would be overkill.
 * `onPress`, when given, replaces the instant toggle (e.g. opening the full
 * language-selection screen from the auth screens instead). */
export function LanguageSwitch({ dark = false, onPress }: { dark?: boolean; onPress?: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  return (
    <Pressable
      onPress={onPress ?? (() => setLocale(locale === 'en' ? 'pt-BR' : 'en'))}
      style={[styles.pill, dark && styles.pillDark]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('language.change')}
    >
      <Text style={[styles.text, dark && styles.textDark]}>{locale === 'en' ? 'EN' : 'PT'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pillDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  textDark: {
    color: '#FFFFFF',
  },
});
