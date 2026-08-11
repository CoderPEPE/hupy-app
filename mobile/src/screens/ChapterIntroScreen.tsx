import { Layers, Mic, Settings } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePlanet } from '../api/hooks';
import { GradientBar } from '../components/GradientBar';
import { PrimaryButton } from '../components/PrimaryButton';
import { Card, IconButton, ScreenHeader } from '../components/ui';
import { plural, useT } from '../i18n';
import { useUiStore } from '../store/ui';
import { colors, radius, spacing, typography } from '../theme';

/** Interstitial shown before a lesson starts — frames the upcoming lesson as
 * a "chapter" (title + how many lessons remain) before handing off to the
 * live chat/voice session, matching the reference's chapter-intro screen. */
export function ChapterIntroScreen() {
  const t = useT();
  const { lessonIntro, cancelLessonIntro, confirmLessonIntro, setTab } = useUiStore();
  const { data: detail } = usePlanet(lessonIntro?.planetId);

  const lessons = detail?.lessons ?? [];
  const lesson = lessons.find((l) => l.id === lessonIntro?.lessonId);
  const remaining = lessons.filter((l) => !l.completed).length;
  const progress = lessons.length ? lessons.filter((l) => l.completed).length / lessons.length : 0;

  if (!lessonIntro || !lesson) return null;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={cancelLessonIntro}
        right={
          <IconButton accessibilityLabel={t('language.change')}>
            <Settings size={20} color={colors.textMuted} />
          </IconButton>
        }
      />

      <View style={styles.body}>
        <GradientBar value={progress} height={6} />

        <Text style={styles.eyebrow}>{t('chapterIntro.chapter', { position: lesson.position })}</Text>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.subtitle}>
          {t(plural(remaining, 'chapterIntro.lessonsLeftOne', 'chapterIntro.lessonsLeftOther'), { count: remaining })}
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title={t('chapterIntro.start')} onPress={confirmLessonIntro} />

        <View style={styles.shortcutRow}>
          <Card
            row
            style={styles.shortcut}
            onPress={() => {
              cancelLessonIntro();
              setTab('flashcards');
            }}
          >
            <View style={styles.shortcutIcon}>
              <Layers size={16} color={colors.primary} />
            </View>
            <Text style={styles.shortcutText}>{t('chapterIntro.myWords')}</Text>
          </Card>
          <Card row style={styles.shortcut} onPress={confirmLessonIntro}>
            <View style={styles.shortcutIcon}>
              <Mic size={16} color={colors.primary} />
            </View>
            <Text style={styles.shortcutText}>{t('chapterIntro.livePractice')}</Text>
          </Card>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  eyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.xl,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  title: {
    ...typography.display,
    marginTop: spacing.sm,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    marginTop: spacing.md,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.lg,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  shortcut: {
    flex: 1,
    padding: spacing.sm,
  },
  shortcutIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutText: {
    ...typography.label,
    color: colors.text,
  },
});
