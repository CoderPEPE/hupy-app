import { Flame, Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGamificationStats } from '../api/hooks';
import { colors, radius } from '../theme';

const XP_PER_LEVEL = 100;

/** Compact streak + level pills, shown in the header of all three main
 * screens — the always-visible Duolingo-style progress signal. Reads from
 * `/api/gamification/stats`, which is entirely server-computed from real
 * learning events, so there's nothing here to fake or reset by refreshing. */
export function StreakXpBar({ dark = false }: { dark?: boolean }) {
  const { data } = useGamificationStats();
  const xp = data?.xp ?? 0;
  const streak = data?.streak_days ?? 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;

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
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
        <Star size={13} color="#FBBF24" fill="#FBBF24" />
        <Text style={[styles.pillText, { color: textColor }]}>{level}</Text>
        <View style={[styles.xpTrack, { backgroundColor: trackBg }]}>
          <View style={[styles.xpFill, { width: `${xpIntoLevel}%` }]} />
        </View>
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
