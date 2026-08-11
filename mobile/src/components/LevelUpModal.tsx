import { Star, Trophy } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { TIER_KEYS, tierForLevel, xpIntoLevel, xpToNextLevel } from '../gamification/levels';

/** How long the level-up modal lingers before dismissing itself. */
const LEVEL_UP_MS = 4600;
import { useT } from '../i18n';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Confetti } from './Confetti';

/**
 * The level-up celebration: a scrim, a card that springs in, a confetti ring
 * that radiates out of the card's center, and a real progress bar toward the
 * next level so the moment also points forward. Auto-dismissed by the parent
 * (see GamificationCelebration) and dismissible by tapping Continue.
 */
export function LevelUpModal({
  level,
  xp,
  xpGained,
  onContinue,
}: {
  level: number;
  xp: number;
  /** The XP this level-up granted — the same number the header's floating
   * badge shows, so the modal and the header tell one story. */
  xpGained: number;
  onContinue: () => void;
}) {
  const t = useT();
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // Auto-dismiss through the same fade path as Continue, so the two ways of
  // leaving the modal look identical.
  useEffect(() => {
    const timer = setTimeout(dismiss, LEVEL_UP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The next-level bar fills in just after the card lands.
  useEffect(() => {
    Animated.timing(fill, {
      toValue: xpIntoLevel(xp),
      duration: 700,
      delay: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fill, xp]);

  const dismiss = () => {
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(onContinue);
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onContinue}>
      <Animated.View style={[styles.scrim, { opacity: fade }]}>
        {/* Confetti ring bursting from the card's center — `pointerEvents=none`
            so it never blocks the Continue tap. */}
        {/* Origin just above the card's center so the first pieces are
            visible immediately instead of occluded behind it. */}
        <Confetti burstKey={level * 7919 + 1} origin={{ top: '42%', left: '50%' }} />
        <Animated.View
          style={[
            styles.card,
            {
              opacity: enter,
              transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            },
          ]}
        >
          <View style={styles.badge}>
            <Trophy size={30} color="#FFFFFF" fill="#FFFFFF" />
          </View>
          <Text style={styles.eyebrow}>{t('levelUp.title')}</Text>
          <Text style={styles.title}>{t('levelUp.reached', { level })}</Text>
          <View style={styles.chipRow}>
            <View style={styles.tierChip}>
              <Star size={12} color={colors.gold} fill={colors.gold} />
              <Text style={styles.tierText}>{t(TIER_KEYS[tierForLevel(level)])}</Text>
            </View>
            {xpGained > 0 && (
              <View style={styles.xpChip}>
                <Star size={12} color={colors.gold} fill={colors.gold} />
                <Text style={styles.xpText}>{t('achievements.xpReward', { xp: xpGained })}</Text>
              </View>
            )}
          </View>

          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>{t('levelUp.xpToNext', { xp: xpToNextLevel(xp) })}</Text>

          <Pressable style={({ pressed }) => [styles.continueBtn, pressed && styles.continueBtnPressed]} onPress={dismiss}>
            <Text style={styles.continueText}>{t('common.continue')}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,14,35,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '88%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.display,
    fontSize: 24,
    marginTop: 4,
    color: colors.text,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tierText: {
    ...typography.label,
    fontWeight: '800',
    color: '#8A6D00',
  },
  // Same visual language as the header's floating +XP badge (white card,
  // gold border) so the modal and the header read as one story.
  xpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  xpText: {
    ...typography.label,
    fontWeight: '800',
    color: '#8A6D00',
  },
  progressTrack: {
    alignSelf: 'stretch',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.gold,
  },
  progressLabel: {
    ...typography.caption,
    marginTop: 6,
    color: colors.textMuted,
  },
  continueBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  continueBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  continueText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
});
