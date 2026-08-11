import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { baseLanguageForLocale, useI18nStore, useT, type Locale } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, radius } from '../theme';

const NEXT: Record<Locale, Locale> = { en: 'es', es: 'pt-BR', 'pt-BR': 'en' };

/** Cycles the UI locale through English → Spanish → Portuguese. One tap moves
 * to the next locale (there are three, so a picker would be overkill).
 * `onPress`, when given, replaces the instant cycle (e.g. opening the full
 * language-selection screen from the auth screens instead). */
export function LanguageSwitch({ dark = false, onPress }: { dark?: boolean; onPress?: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const user = useAuthStore((s) => s.user);
  const setLanguage = useAuthStore((s) => s.setLanguage);

  /** The learner's language and the interface language are the same choice, so
   * when signed in this changes the account's base language — a locale set
   * only on the device would be overwritten by the account on next launch. */
  const cycle = () => {
    let next = NEXT[locale];
    // The base can never equal the language being learned; with three
    // languages, skipping the collision always lands on a valid one.
    if (user && baseLanguageForLocale(next) === user.language) next = NEXT[next];
    if (!user) {
      setLocale(next);
      return;
    }
    // persistUser() in the auth store switches the locale on success, so the
    // UI and the account can't disagree even if the request fails.
    setLanguage(user.language, baseLanguageForLocale(next)).catch(() => {});
  };

  return (
    <Pressable
      onPress={onPress ?? cycle}
      style={[styles.pill, dark && styles.pillDark]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('language.change')}
    >
      <Text style={[styles.text, dark && styles.textDark]}>
        {locale === 'en' ? 'EN' : locale === 'es' ? 'ES' : 'PT'}
      </Text>
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
