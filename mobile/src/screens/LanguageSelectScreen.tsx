import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Dropdown, ScreenHeader, type DropdownOption } from '../components/ui';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { localeForBaseLanguage, useI18nStore, useT, type Locale } from '../i18n';
import { storage, StorageKeys } from '../storage';
import { useAuthStore } from '../store/auth';
import { colors, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'LanguageSelect'>;

/** The learner's base (\"I speak\") languages. Switching base also switches the
 * app's UI locale — the two always move together (Spanish speakers get a
 * Spanish interface). */
type SpeakCode = 'pt' | 'en' | 'es';

function isSpeakCode(value: string | undefined | null): value is SpeakCode {
  return value === 'pt' || value === 'en' || value === 'es';
}

/** Display info for each of the three languages. */
const LANGUAGES: Record<SpeakCode, { flag: string; name: string }> = {
  pt: { flag: '🇧🇷', name: 'Português' },
  en: { flag: '🇺🇸', name: 'English' },
  es: { flag: '🇪🇸', name: 'Español' },
};

/** The base languages, in the order the picker lists them. */
const SPEAK_CODES: SpeakCode[] = ['pt', 'en', 'es'];

/** Language codes -> dropdown options (flag + native name). */
const dropdownOptions = (codes: SpeakCode[]): DropdownOption[] =>
  codes.map((code) => ({ value: code, label: LANGUAGES[code].name, icon: LANGUAGES[code].flag }));

/** Speak -> learn for the full matrix. There is a real, fully-seeded course
 * for every one of the six (base, target) pairs on the backend — the same
 * planet path, duplicated per course, with scripted lessons taught in the
 * base language. */
const TARGETS_BY_SPEAK: Record<SpeakCode, SpeakCode[]> = {
  pt: ['en', 'es'],
  en: ['pt', 'es'],
  es: ['en', 'pt'],
};

/** Which base the stored course implies, when it's consistent. Falls back to
 * the UI locale (device detection) on a fresh install with nothing stored.
 * Only consulted when signed out — a signed-in learner's account wins, so the
 * picker can't show "Português" while the account says Español. */
function speakFromStorage(locale: Locale): SpeakCode {
  const base = storage.getString(StorageKeys.baseLanguage);
  if (base === 'pt' || base === 'en' || base === 'es') return base;
  // Legacy: infer the base from the stored target (en/es were taught from pt).
  const target = storage.getString(StorageKeys.targetLanguage);
  if (target === 'en' || target === 'es') return 'pt';
  if (target === 'pt') return 'en';
  return locale === 'pt-BR' ? 'pt' : locale === 'es' ? 'es' : 'en';
}

/** Reads the stored target, falling back to the first valid one for the
 * current base if the stored one no longer applies. */
function initialTarget(speak: SpeakCode): SpeakCode {
  const stored = storage.getString(StorageKeys.targetLanguage);
  if (stored && (TARGETS_BY_SPEAK[speak] as string[]).includes(stored)) return stored as SpeakCode;
  return TARGETS_BY_SPEAK[speak][0];
}

/** The picker's content, shared by the pre-login route (Auth stack, via
 * `LanguageSelectScreen` below) and the Profile-settings entry point (shown
 * full-screen from a Modal there) — `onDone` closes whichever container
 * it's presented in. */
export function LanguagePickerScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const user = useAuthStore((s) => s.user);
  // The signed-in account is the source of truth; storage is the signed-out
  // fallback. Reading storage first is what let the picker disagree with the
  // course shown on the profile.
  const initialSpeak = isSpeakCode(user?.base_language) ? user.base_language : speakFromStorage(locale);
  const [speak, setSpeak] = useState<SpeakCode>(initialSpeak);
  const [target, setTarget] = useState<SpeakCode>(() =>
    isSpeakCode(user?.language) ? user.language : initialTarget(initialSpeak),
  );
  const targets = TARGETS_BY_SPEAK[speak];

  /** Persists the (base, target) pair to storage and, when logged in, to the
   * backend so the next planet list is served from the new course. Best
   * effort — a network failure must not block the UI.
   * `base` is passed explicitly rather than read from `speak`: changing the
   * base calls this from `selectSpeak` before the `setSpeak` render lands, so
   * the closure would still hold the previous base — the account would keep
   * the old course and snap the UI locale back to it. */
  const selectTarget = (code: string, base: SpeakCode = speak) => {
    setTarget(code as SpeakCode);
    storage.set(StorageKeys.baseLanguage, base);
    storage.set(StorageKeys.targetLanguage, code);
    if (useAuthStore.getState().token) {
      useAuthStore.getState().setLanguage(code, base).catch(() => {});
    }
  };

  /** Picks the base language, switching the UI locale with it and
   * re-resolving the target so the stored course stays valid. */
  const selectSpeak = (next: SpeakCode) => {
    setSpeak(next);
    // Optimistic: switch the interface now, the account call confirms it.
    const nextLocale = localeForBaseLanguage(next);
    if (nextLocale) setLocale(nextLocale);
    selectTarget(initialTarget(next), next);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={onDone} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('languagePicker.title')}</Text>
        <Text style={styles.subtitle}>{t('languagePicker.subtitle')}</Text>

        <Text style={styles.sectionLabel}>{t('languagePicker.iSpeak')}</Text>
        <Dropdown
          value={speak}
          options={dropdownOptions(SPEAK_CODES)}
          onChange={(code) => selectSpeak(code as SpeakCode)}
        />

        <Text style={styles.sectionLabel}>{t('languagePicker.iWantToLearn')}</Text>
        <Dropdown
          value={target}
          options={dropdownOptions(targets)}
          onChange={selectTarget}
        />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton title={t('languagePicker.continue')} onPress={onDone} />
      </View>
    </View>
  );
}

/** Auth-stack route wrapper — pre-login entry point (from the Login screen's
 * language pill). */
export function LanguageSelectScreen({ navigation }: Props) {
  return <LanguagePickerScreen onDone={() => navigation.goBack()} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.display,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    marginTop: 4,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionLabel: {
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.lg,
  },
});
