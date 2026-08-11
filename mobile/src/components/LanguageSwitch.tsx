import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useI18nStore } from '../i18n';
import { colors, radius } from '../theme';

/** Toggles between English and Brazilian Portuguese. One tap cycles the pair —
 * there are only two supported locales, so a picker would be overkill. */
export function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  return (
    <Pressable
      onPress={() => setLocale(locale === 'en' ? 'pt-BR' : 'en')}
      style={[styles.pill, dark && styles.pillDark]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Change language"
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
