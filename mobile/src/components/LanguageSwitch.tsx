import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { baseLanguageForLocale, useI18nStore, useT, type Locale } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, radius } from '../theme';

const CODE: Record<Locale, string> = { en: 'EN', es: 'ES', 'pt-BR': 'PT' };

/** Preference order for where one tap lands. Portuguese and English come
 * first, so the switch reads "PT | EN" for the Brazilian audience the product
 * is built for; Spanish is the fallback, and stays reachable from the full
 * picker (auth) and Profile. */
const ORDER: Locale[] = ['pt-BR', 'en', 'es'];

/** Toggles the UI locale. One tap moves to the next locale in `ORDER` that
 * isn't the current one — skipping the language being learned, since the
 * interface language doubles as the learner's base and the two can't match.
 * `onPress`, when given, replaces the instant toggle (e.g. opening the full
 * language-selection screen from the auth screens instead). */
export function LanguageSwitch({ dark = false, onPress }: { dark?: boolean; onPress?: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const user = useAuthStore((s) => s.user);
  const setLanguage = useAuthStore((s) => s.setLanguage);

  const next =
    ORDER.find((l) => l !== locale && baseLanguageForLocale(l) !== user?.language) ?? locale;

  /** The learner's language and the interface language are the same choice, so
   * when signed in this changes the account's base language — a locale set
   * only on the device would be overwritten by the account on next launch. */
  const cycle = () => {
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
      {/* Shows where a tap lands ("PT | EN") rather than just the current
          locale, so the toggle is discoverable without a picker. */}
      <Text style={[styles.text, dark && styles.textDark]}>
        {CODE[locale]}
        <Text style={[styles.next, dark && styles.textDark]}>{`  |  ${CODE[next]}`}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 40,
    height: 40,
    borderRadius: radius.round,
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
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  next: {
    fontWeight: '600',
    color: colors.textFaint,
  },
  textDark: {
    color: '#FFFFFF',
  },
});
