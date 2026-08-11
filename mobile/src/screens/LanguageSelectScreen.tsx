import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ChevronRight } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Card, ScreenHeader } from '../components/ui';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useI18nStore, useT } from '../i18n';
import { storage, StorageKeys } from '../storage';
import { useAuthStore } from '../store/auth';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'LanguageSelect'>;

/** The learner's base (\"I speak\") languages. Toggling this also switches the
 * app's UI locale — the two always move together. */
type SpeakCode = 'pt' | 'en';

/** Which courses are offered from each base. There is a real, fully-seeded
 * course for every target: English and Spanish taught from Portuguese, and
 * Portuguese taught from English (the same planet path, duplicated per
 * course on the backend). */
const TARGETS_BY_SPEAK: Record<SpeakCode, { code: string; flag: string; name: string }[]> = {
  pt: [
    { code: 'en', flag: '🇺🇸', name: 'English' },
    { code: 'es', flag: '🇪🇸', name: 'Español' },
  ],
  en: [{ code: 'pt', flag: '🇧🇷', name: 'Português' }],
};

/** Reads the stored course, falling back to the first valid target for the
 * current base if the stored one no longer applies (e.g. stored 'pt' while
 * speaking Portuguese). */
function initialTarget(speak: SpeakCode): string {
  const stored = storage.getString(StorageKeys.targetLanguage);
  if (stored && TARGETS_BY_SPEAK[speak].some((t) => t.code === stored)) return stored;
  return TARGETS_BY_SPEAK[speak][0].code;
}

/** The picker's content, shared by the pre-login route (Auth stack, via
 * `LanguageSelectScreen` below) and the Profile-settings entry point (shown
 * full-screen from a Modal there) — `onDone` closes whichever container
 * it's presented in. */
export function LanguagePickerScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const [speak, setSpeak] = useState<SpeakCode>(locale === 'pt-BR' ? 'pt' : 'en');
  const [target, setTarget] = useState(() => initialTarget(locale === 'pt-BR' ? 'pt' : 'en'));
  const targets = TARGETS_BY_SPEAK[speak];

  const selectTarget = (code: string) => {
    setTarget(code);
    storage.set(StorageKeys.targetLanguage, code);
    // Logged-in learners switch their live course on the backend so the next
    // planet list is served from the new course. Best effort — a network
    // failure must not block the UI.
    if (useAuthStore.getState().token) {
      useAuthStore.getState().setLanguage(code).catch(() => {});
    }
  };

  const toggleSpeak = () => {
    const next: SpeakCode = speak === 'pt' ? 'en' : 'pt';
    setSpeak(next);
    setLocale(next === 'pt' ? 'pt-BR' : 'en');
    // Re-routing through selectTarget keeps the stored course and the
    // backend in sync even when the base switch changes which target is
    // shown (e.g. stored 'es' + speak 'en' shows 'pt').
    selectTarget(initialTarget(next));
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={onDone} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('languagePicker.title')}</Text>
        <Text style={styles.subtitle}>{t('languagePicker.subtitle')}</Text>

        <Text style={styles.sectionLabel}>{t('languagePicker.iSpeak')}</Text>
        <Card row style={styles.speakRow} onPress={toggleSpeak}>
          <View style={styles.speakFlagBadge}>
            <Text style={styles.speakFlag}>{speak === 'pt' ? '🇧🇷' : '🇺🇸'}</Text>
          </View>
          <Text style={styles.speakText}>{speak === 'pt' ? 'Português' : 'English'}</Text>
          <ChevronRight size={18} color={colors.textFaint} />
        </Card>

        <Text style={styles.sectionLabel}>{t('languagePicker.iWantToLearn')}</Text>
        <View style={styles.grid}>
          {targets.map((lang) => {
            const selected = target === lang.code;
            return (
              <Card
                key={lang.code}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => selectTarget(lang.code)}
              >
                <View style={styles.flagCircle}>
                  <Text style={styles.flagEmoji}>{lang.flag}</Text>
                </View>
                <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>{lang.name}</Text>
                {selected && (
                  <View style={styles.checkBadge}>
                    <Check size={10} color="#FFFFFF" strokeWidth={3.5} />
                  </View>
                )}
              </Card>
            );
          })}
        </View>
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
  speakRow: {
    padding: spacing.sm + 2,
  },
  speakFlagBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  speakFlag: {
    fontSize: 20,
  },
  speakText: {
    ...typography.cardTitle,
    flex: 1,
    fontWeight: '700',
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  card: {
    width: '31.5%',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  flagCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  flagEmoji: {
    fontSize: 24,
  },
  cardLabel: {
    ...typography.caption,
    marginTop: spacing.xs + 2,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  cardLabelSelected: {
    color: colors.primary,
    fontWeight: '800',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.lg,
  },
});
