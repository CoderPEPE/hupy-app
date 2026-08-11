import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGamificationStats, type Achievement } from '../api/gamification';
import { queryKeys } from '../api/hooks';
import { decideCelebration, pullNextToast, pushToasts } from '../gamification/celebrate';
import { useT } from '../i18n';
import { storage, StorageKeys } from '../storage';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { achievementIcon, TIER_COLORS } from './achievementIcons';
import { LevelUpModal } from './LevelUpModal';

/** How long each achievement toast stays up. */
const TOAST_MS = 3800;

function readSeenCodes(): string[] {
  try {
    const raw = storage.getString(StorageKeys.seenAchievements);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function persistSeenCodes(codes: string[]) {
  storage.set(StorageKeys.seenAchievements, JSON.stringify(codes));
}

function AchievementToast({ achievement, onDone }: { achievement: Achievement; onDone: () => void }) {
  const t = useT();
  const enter = useRef(new Animated.Value(0)).current;
  const { Icon } = achievementIcon(achievement.icon);
  const tierColor = TIER_COLORS[achievement.tier];

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) }],
        },
      ]}
    >
      <View style={[styles.toastIcon, { backgroundColor: tierColor.soft }]}>
        <Icon size={18} color={tierColor.tint} />
      </View>
      <View style={styles.toastBody}>
        <Text style={styles.toastEyebrow}>{t('levelUp.achievement')}</Text>
        <Text style={styles.toastTitle} numberOfLines={1}>
          {achievement.title}
        </Text>
      </View>
      <Text style={styles.toastXp}>+{achievement.xp_reward} XP</Text>
    </Animated.View>
  );
}

/**
 * Global gamification celebrations, mounted once at the app root. Watches the
 * server-computed `/api/gamification/stats`:
 *
 * - a level-up (XP crossing a multiple of `XP_PER_LEVEL`) opens the confetti
 *   LevelUpModal — the previous level is remembered in MMKV so this only
 *   happens while the learner is actually earning, never on a fresh install;
 * - a newly earned achievement slides in a small toast with its tier colour
 *   and XP reward (earned codes are remembered, so each toasts exactly once).
 *
 * Purely presentational: it never writes progress, only acknowledges it.
 */
export function GamificationCelebration() {
  const { data } = useQuery({ queryKey: queryKeys.gamification, queryFn: getGamificationStats });
  const insets = useSafeAreaInsets();
  const [levelUp, setLevelUp] = useState<{ level: number; xp: number; xpGained: number } | null>(null);
  const prevXpRef = useRef<number | null>(null);
  // Visible toasts + a queue for the overflow, so a batch larger than the
  // visible cap still shows every achievement in turn. All mutations go
  // through the pure helpers in gamification/celebrate (unit-tested there).
  const [toastQueue, setToastQueue] = useState<{ visible: Achievement[]; queue: Achievement[] }>({
    visible: [],
    queue: [],
  });

  useEffect(() => {
    if (!data) return;
    // Pure decision: what to celebrate, and what to persist. Side effects
    // below apply it — storage writes first, so a refetch or a StrictMode
    // re-run sees the updated baseline and never double-celebrates.
    const seenCodes = readSeenCodes();
    // MMKV returns undefined for a missing key; the decision treats null as
    // "never seen" — normalize so the two mean the same thing.
    const prevLevel = storage.getNumber(StorageKeys.lastLevel) ?? null;
    const prevXp = prevXpRef.current;
    prevXpRef.current = data.xp;
    const decision = decideCelebration({
      xp: data.xp,
      prevXp,
      achievements: data.achievements,
      lastLevel: prevLevel,
      seenCodes,
    });
    // Only touch storage when a decision actually changed it — a plain
    // refetch with no new progress should not rewrite either key.
    if (decision.nextLastLevel !== prevLevel) storage.set(StorageKeys.lastLevel, decision.nextLastLevel);
    if (decision.nextSeenCodes !== seenCodes) persistSeenCodes(decision.nextSeenCodes);
    if (decision.levelUp) setLevelUp(decision.levelUp);
    if (decision.freshAchievements.length > 0) {
      setToastQueue((prev) => pushToasts(prev.visible, prev.queue, decision.freshAchievements));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      {levelUp ? (
        <LevelUpModal
          level={levelUp.level}
          xp={levelUp.xp}
          xpGained={levelUp.xpGained}
          onContinue={() => setLevelUp(null)}
        />
      ) : null}
      {toastQueue.visible.length > 0 ? (
        <View pointerEvents="none" style={[styles.toastLayer, { top: insets.top + 8 }]}>
          {toastQueue.visible.map((a) => (
            <AchievementToast
              key={a.code}
              achievement={a}
              onDone={() =>
                setToastQueue((prev) =>
                  pullNextToast(
                    prev.visible.filter((x) => x.code !== a.code),
                    prev.queue,
                  ),
                )
              }
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: 340,
    ...shadows.card,
  },
  toastIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBody: {
    flexShrink: 1,
  },
  toastEyebrow: {
    ...typography.eyebrow,
    fontSize: 9,
    color: colors.textFaint,
  },
  toastTitle: {
    ...typography.label,
    color: colors.text,
  },
  toastXp: {
    ...typography.label,
    fontWeight: '800',
    color: colors.gold,
  },
});
