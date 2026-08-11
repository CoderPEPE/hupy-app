import { Flame, Star } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useGamificationStats } from '../api/hooks';
import { levelFromXp, xpIntoLevel } from '../gamification/levels';
import { FLOAT_MS, fillAnimKind, levelUpFillSteps } from '../gamification/xpFloat';
import { colors, radius } from '../theme';
import { FloatingXp } from './FloatingXp';

/** Compact streak + level pills, shown in the header of all three main
 * screens — the always-visible Duolingo-style progress signal. Reads from
 * `/api/gamification/stats`, which is entirely server-computed from real
 * learning events, so there's nothing here to fake or reset by refreshing. */
export function StreakXpBar({ dark = false }: { dark?: boolean }) {
  const { data } = useGamificationStats();
  const xp = data?.xp ?? 0;
  const streak = data?.streak_days ?? 0;
  const level = levelFromXp(xp);
  const pct = xpIntoLevel(xp);

  // JS-driven (width isn't a native-driver property): the fill eases toward
  // the new value every time XP lands, so a review session visibly charges
  // the bar instead of snapping it.
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const prevLevel = useRef(level);
  const prevXpRef = useRef<number | null>(null);
  const prevPctRef = useRef(pct);

  useEffect(() => {
    const prevXp = prevXpRef.current;
    prevXpRef.current = xp;
    const prevPct = prevPctRef.current;
    prevPctRef.current = pct;

    switch (fillAnimKind(prevXp, xp, prevPct, pct)) {
      case 'gain':
        // Same-level gain: the bar counts up in step with the "+N XP" badge
        // FloatingXp spawns from the very same delta — same duration and
        // easing, so the fill and the float start and land together.
        Animated.timing(fill, {
          toValue: pct,
          duration: FLOAT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
        break;
      case 'levelup': {
        // Crossed into a new level: the bar completes, resets, and charges
        // the remainder — the steps (see levelUpFillSteps) sum to exactly
        // FLOAT_MS, so the sweep lands the moment the "+N XP" badge finishes
        // its rise.
        const [topUpMs, resetMs, chargeMs] = levelUpFillSteps();
        Animated.sequence([
          Animated.timing(fill, {
            toValue: 100,
            duration: topUpMs,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(fill, { toValue: 0, duration: resetMs, useNativeDriver: false }),
          Animated.timing(fill, {
            toValue: pct,
            duration: chargeMs,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ]).start();
        break;
      }
      default:
        // Mount (first data sight) or an XP reset: quick, quiet settle.
        Animated.timing(fill, {
          toValue: pct,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();
    }
  }, [xp, pct, fill]);

  // The level pill does a quick spring-bounce whenever the level number
  // changes, so the whole header reacts to a level-up in place.
  useEffect(() => {
    if (level === prevLevel.current) return;
    prevLevel.current = level;
    pulse.setValue(0);
    Animated.sequence([
      Animated.spring(pulse, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [level, pulse]);

  const textColor = dark ? '#FFFFFF' : colors.text;
  const pillBg = dark ? 'rgba(255,255,255,0.08)' : colors.surface;
  const pillBorder = dark ? 'rgba(255,255,255,0.12)' : colors.border;
  const trackBg = dark ? 'rgba(255,255,255,0.16)' : colors.border;

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
        <Flame size={13} color={streak > 0 ? '#F97316' : colors.textFaint} fill={streak > 0 ? '#F97316' : 'none'} />
        <Text style={[styles.pillText, { color: textColor }]}>{streak}</Text>
      </View>
      <View style={styles.levelWrap}>
        <Animated.View
          style={[
            styles.pill,
            { backgroundColor: pillBg, borderColor: pillBorder },
            {
              transform: [
                {
                  scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }),
                },
              ],
            },
          ]}
        >
          <Star size={13} color="#FBBF24" fill="#FBBF24" />
          <Text style={[styles.pillText, { color: textColor }]}>{level}</Text>
          <View style={[styles.xpTrack, { backgroundColor: trackBg }]}>
            <Animated.View
              style={[
                styles.xpFill,
                { width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </Animated.View>
        {/* "+N XP" badges float up from the pill when XP lands — same query,
            so the delta here is exactly the gain the bar is about to show. */}
        <FloatingXp />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelWrap: {
    position: 'relative',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  xpTrack: {
    width: 20,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 2,
  },
  xpFill: {
    height: '100%',
    backgroundColor: '#FBBF24',
    borderRadius: 2,
  },
});
