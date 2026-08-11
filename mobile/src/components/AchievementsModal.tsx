import { Check, Lock } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ScreenHeader } from './ui';
import { achievementIcon, TIER_COLORS } from './achievementIcons';
import type { Achievement, AchievementCategory } from '../api/gamification';
import { useT, type TranslationKey } from '../i18n';
import { colors, radius, spacing, typography } from '../theme';

/** Display order of the sections, and the label key for each. */
const CATEGORIES: { id: AchievementCategory; label: TranslationKey }[] = [
  { id: 'lessons', label: 'achievements.catLessons' },
  { id: 'planets', label: 'achievements.catPlanets' },
  { id: 'sentences', label: 'achievements.catSentences' },
  { id: 'cards', label: 'achievements.catCards' },
  { id: 'conversation', label: 'achievements.catConversation' },
  { id: 'corrections', label: 'achievements.catCorrections' },
  { id: 'streak', label: 'achievements.catStreak' },
  { id: 'xp', label: 'achievements.catXp' },
];

function AchievementRow({ item }: { item: Achievement }) {
  const t = useT();
  const earned = !!item.earned_at;
  const { Icon } = achievementIcon(item.icon);
  const tier = TIER_COLORS[item.tier] ?? TIER_COLORS.bronze;
  const ratio = item.threshold > 0 ? Math.min(1, item.progress / item.threshold) : 0;

  return (
    <Card row style={[styles.row, !earned && styles.rowLocked]}>
      <View style={[styles.icon, { backgroundColor: earned ? tier.soft : colors.border }]}>
        <Icon size={20} color={earned ? tier.tint : colors.textFaint} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, !earned && styles.textLocked]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.desc} numberOfLines={2}>
          {item.description}
        </Text>
        {!earned && (
          <View style={styles.progressWrap}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: tier.tint }]} />
            </View>
            <Text style={styles.progressText}>
              {item.progress}/{item.threshold}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.trailing}>
        {earned ? (
          <View style={[styles.check, { backgroundColor: tier.soft }]}>
            <Check size={14} color={tier.tint} strokeWidth={3} />
          </View>
        ) : (
          <Lock size={14} color={colors.textFaint} />
        )}
        <Text style={[styles.xp, earned && { color: tier.tint }]}>
          {t('achievements.xpReward', { xp: item.xp_reward })}
        </Text>
      </View>
    </Card>
  );
}

/** The full achievement catalog: every achievement, earned or not, grouped by
 * category with a progress bar on the locked ones — seeing what is *nearly*
 * earned is the point, so locked entries are never hidden. */
export function AchievementsModal({
  visible,
  onClose,
  achievements,
  earnedCount,
}: {
  visible: boolean;
  onClose: () => void;
  achievements: Achievement[];
  earnedCount: number;
}) {
  const t = useT();
  const [showEarnedOnly, setShowEarnedOnly] = useState(false);

  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        items: achievements.filter(
          (a) => a.category === c.id && (!showEarnedOnly || a.earned_at),
        ),
        earned: achievements.filter((a) => a.category === c.id && a.earned_at).length,
        total: achievements.filter((a) => a.category === c.id).length,
      })).filter((s) => s.items.length > 0),
    [achievements, showEarnedOnly],
  );

  const total = achievements.length;
  const ratio = total > 0 ? earnedCount / total : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <ScreenHeader onBack={onClose} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.screenTitle}>{t('achievements.title')}</Text>
          <Text style={styles.screenSub}>
            {t('achievements.earnedOf', { earned: earnedCount, total })}
          </Text>

          <View style={styles.overallTrack}>
            <View style={[styles.overallFill, { width: `${ratio * 100}%` }]} />
          </View>

          <Pressable
            style={[styles.filter, showEarnedOnly && styles.filterOn]}
            onPress={() => setShowEarnedOnly((v) => !v)}
          >
            <Text style={[styles.filterText, showEarnedOnly && styles.filterTextOn]}>
              {showEarnedOnly ? t('achievements.showAll') : t('achievements.showEarned')}
            </Text>
          </Pressable>

          {sections.map((s) => (
            <View key={s.id}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t(s.label)}</Text>
                <Text style={styles.sectionCount}>
                  {s.earned}/{s.total}
                </Text>
              </View>
              {s.items.map((a) => (
                <AchievementRow key={a.code} item={a} />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  screenTitle: { ...typography.display, fontSize: 24, color: colors.text, textAlign: 'center' },
  screenSub: {
    ...typography.caption,
    marginTop: 4,
    color: colors.textMuted,
    textAlign: 'center',
  },
  overallTrack: {
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  overallFill: { height: '100%', backgroundColor: colors.primary },
  filter: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
  },
  filterOn: { backgroundColor: colors.primary },
  filterText: { ...typography.label, color: colors.primary },
  filterTextOn: { color: colors.textOnPrimary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.label, color: colors.textMuted },
  sectionCount: { ...typography.label, color: colors.textFaint },
  row: { marginBottom: spacing.sm, alignItems: 'flex-start' },
  rowLocked: { opacity: 0.85 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  body: { flex: 1 },
  title: { ...typography.cardTitle, fontWeight: '700', color: colors.text },
  textLocked: { color: colors.textMuted },
  desc: { ...typography.caption, marginTop: 1, color: colors.textMuted },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.round,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  progressText: { ...typography.caption, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  trailing: { alignItems: 'center', gap: 4, marginLeft: spacing.sm, minWidth: 44 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xp: { ...typography.caption, fontWeight: '800', color: colors.textFaint },
});
