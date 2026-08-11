import { Star } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { useGamificationStats } from '../api/hooks';
import { useT } from '../i18n';
import { FLOAT_MS, pushXpFloat, xpGain } from '../gamification/xpFloat';
import { colors, radius, shadows } from '../theme';
import { xpChimePlayer } from '../voice/xpChime';

/** Vertical gap between stacked floats — the newest sits closest to the pill,
 * each older one one slot higher, so the ladder is always 0, 22, 44. */
const STACK_STEP = 22;

type XpFloat = { id: number; amount: number; progress: Animated.Value };

/**
 * Floating "+N XP" feedback above the header's level pill. Watches the shared
 * `/api/gamification/stats` query; whenever the server-computed XP total goes
 * up, a badge with the real delta rises from the pill and fades.
 *
 * The amount is the delta of the backend's own total — it only reports XP the
 * server already granted (a review, a mastered sentence, a correction, an
 * achievement reward), so it can't be gamed or double-counted client-side.
 * Baselines silently on first sight and ignores non-positive deltas.
 */
export function FloatingXp() {
  const t = useT();
  const { data } = useGamificationStats();
  const [floats, setFloats] = useState<XpFloat[]>([]);
  const prevXpRef = useRef<number | null>(null);
  const nextIdRef = useRef(1);
  const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

  // Stop any in-flight float when the screen unmounts (tab switch mid-badge)
  // — otherwise the animation keeps running and calls setState on unmount.
  useEffect(() => {
    return () => {
      animationsRef.current.forEach((a) => a.stop());
      animationsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const prev = prevXpRef.current;
    prevXpRef.current = data.xp;
    // Pure decisions: is this a gain worth floating, and where does the new
    // badge sit in the stack (see gamification/xpFloat, unit-tested there).
    const amount = xpGain(prev, data.xp);
    if (amount == null) return;
    // The chime lands with the badge and the fill — same gain, same moment.
    // Dedup across mounted bar instances and the tutor-voice guard live in
    // the player, so this call is safe from every screen at once.
    xpChimePlayer.play(data.xp);
    const id = nextIdRef.current++;

    // Reconcile the pure stack decision with the live Animated handles:
    // existing floats keep their running `progress`, only the new badge gets
    // a fresh one. The updater stays side-effect free.
    const progress = new Animated.Value(0);
    setFloats((list) => {
      const existing = new Map(list.map((f) => [f.id, f] as const));
      // Newest-first (see pushXpFloat): eviction drops the oldest at the end
      // of the list, so the floats still on screen never reindex.
      const specs = pushXpFloat(
        list.map(({ id, amount }) => ({ id, amount })),
        { id, amount },
      );
      return specs.map((s) => existing.get(s.id) ?? { ...s, progress });
    });

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: FLOAT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animationsRef.current.push(animation);
    animation.start(({ finished }) => {
      animationsRef.current = animationsRef.current.filter((a) => a !== animation);
      // `finished` is false when the unmount cleanup stopped it — skip the
      // state update then, so a completed render is never touched.
      if (finished) setFloats((list) => list.filter((f) => f.id !== id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      {floats.map((f, i) => {
        // List is newest-first, so the index IS the vertical slot: the badge
        // at the front sits on the pill, older ones stack above it.
        const slot = i * STACK_STEP;
        return (
          <Animated.View
            key={f.id}
            pointerEvents="none"
            style={[
              styles.badge,
              {
                opacity: f.progress.interpolate({
                  inputRange: [0, 0.12, 0.8, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateY: f.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [slot, slot - 42],
                    }),
                  },
                  {
                    scale: f.progress.interpolate({
                      inputRange: [0, 0.12, 1],
                      outputRange: [0.7, 1.08, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Star size={10} color={colors.gold} fill={colors.gold} />
            <Text style={styles.text}>{t('achievements.xpReward', { xp: f.amount })}</Text>
          </Animated.View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...shadows.card,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
});
