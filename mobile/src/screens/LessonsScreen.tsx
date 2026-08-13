import { Check, ChevronRight, Lock } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePlanet, usePlanets } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { PlanetTile } from '../components/PlanetTile';
import { StateChip } from '../components/StateChip';
import { StreakXpBar } from '../components/StreakXpBar';
import { Card, ScreenHeader } from '../components/ui';
import { useT } from '../i18n';
import { useUiStore } from '../store/ui';
import { colors, radius, spacing, typography } from '../theme';
import { isBlockDone, type Planet, type PlanetLesson } from '../types';

function LessonRow({ lesson, onPress }: { lesson: PlanetLesson; onPress: () => void }) {
  const t = useT();
  const locked = lesson.state === 'locked';
  const done = isBlockDone(lesson.state);

  return (
    <Card row style={styles.lessonRow} onPress={locked ? undefined : onPress} disabled={locked}>
      <View
        style={[
          styles.lessonBadge,
          done && styles.lessonBadgeDone,
          !done && !locked && styles.lessonBadgeCurrent,
        ]}
      >
        {done ? (
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        ) : locked ? (
          <Lock size={13} color={colors.textFaint} />
        ) : (
          <Text style={styles.lessonBadgeText}>{lesson.position}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.lessonTitle, locked && styles.lessonTitleLocked]}>{lesson.title}</Text>
        <Text style={styles.lessonDesc} numberOfLines={1}>
          {lesson.description}
        </Text>
        <View style={styles.lessonStateRow}>
          <StateChip block={lesson.state} />
          {/* The half of the gate that is left: the module's own cards. */}
          {lesson.state === 'flashcards_pending' && lesson.flashcards_total > 0 && (
            <Text style={styles.lessonCards}>
              {t('lessons.cardsProgress', {
                done: lesson.flashcards_reviewed,
                total: lesson.flashcards_total,
              })}
            </Text>
          )}
        </View>
      </View>
      {!locked && <ChevronRight size={18} color={colors.textFaint} />}
    </Card>
  );
}

function PlanetLessonsSection({ planet }: { planet: Planet }) {
  const t = useT();
  const { beginLesson, reviewModule } = useUiStore();
  const { data: detail, isLoading } = usePlanet(planet.id);
  const locked = planet.status === 'locked';
  const mastery = Math.round((planet.progress?.mastery ?? 0) * 100);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <PlanetTile planetNumber={planet.number} color={planet.color} size={40} locked={locked} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.sectionTitle}>{planet.title}</Text>
          <Text style={styles.sectionSubtitle}>{planet.subtitle}</Text>
        </View>
        {!locked && <Text style={[styles.sectionPct, { color: planet.color }]}>{mastery}%</Text>}
      </View>

      {locked ? (
        <View style={styles.lockedNotice}>
          <Lock size={13} color={colors.textFaint} />
          <Text style={styles.lockedNoticeText}>{t('planets.locked')}</Text>
        </View>
      ) : isLoading || !detail ? (
        <Text style={styles.loadingText}>{t('planets.loadingLessons')}</Text>
      ) : (
        detail.lessons.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            // A module waiting on its cards is reviewed on the Flashcards tab.
            onPress={() =>
              lesson.state === 'flashcards_pending'
                ? reviewModule(lesson.id)
                : beginLesson(planet.id, lesson.id)
            }
          />
        ))
      )}
    </View>
  );
}

/** All lessons, grouped by planet — a global counterpart to the per-planet
 * lesson path already shown inside each planet's detail screen. Tapping a
 * lesson reuses the existing chapter-intro -> chat flow. */
export function LessonsScreen() {
  const t = useT();
  const { data: planets = [], isLoading } = usePlanets();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('tabBar.lessons')} right={<StreakXpBar />} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isLoading && planets.map((planet) => <PlanetLessonsSection key={planet.id} planet={planet} />)}
      </ScrollView>

      <AppTabBar />
    </View>
  );
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionPct: {
    ...typography.label,
    fontWeight: '800',
  },
  lockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  lockedNoticeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textFaint,
  },
  lessonStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  lessonCards: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand.orange,
  },
  lessonRow: {
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  lessonBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonBadgeDone: {
    backgroundColor: colors.success,
  },
  lessonBadgeCurrent: {
    backgroundColor: colors.primary,
  },
  lessonBadgeText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  lessonTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  lessonTitleLocked: {
    color: colors.textFaint,
  },
  lessonDesc: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
