import { AudioLines, BarChart4, BookOpen, ChevronRight, Flame, Lock, MessageSquare, Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFlashcards, useGamificationStats, usePlanets } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { GradientBar } from '../components/GradientBar';
import { PlanetTile } from '../components/PlanetTile';
import { PlanetUnlockCelebration } from '../components/PlanetUnlockCelebration';
import { Card, ScreenHeader, SectionHeader } from '../components/ui';
import { useT } from '../i18n';
import { storage, StorageKeys } from '../storage';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { displayName } from '../utils/userName';
import type { Planet } from '../types';

function readCelebratedIds(): string[] {
  try {
    const raw = storage.getString(StorageKeys.celebratedUnlocks);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function persistCelebratedIds(ids: string[]) {
  storage.set(StorageKeys.celebratedUnlocks, JSON.stringify(ids));
}

function PlanetRow({
  planet,
  onPress,
  celebrating,
  onCelebrationDone,
}: {
  planet: Planet;
  onPress: () => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
}) {
  const t = useT();
  const locked = planet.status === 'locked';
  const mastery = Math.round((planet.progress?.mastery ?? 0) * 100);

  return (
    <Card row style={[styles.planetRow, locked && styles.planetRowLocked]} onPress={locked ? undefined : onPress} disabled={locked}>
      <View style={styles.tileWrap}>
        <PlanetTile planetNumber={planet.number} color={planet.color} size={64} locked={locked} />
        {celebrating && (
          <PlanetUnlockCelebration
            planetNumber={planet.number}
            color={planet.color}
            size={64}
            onDone={onCelebrationDone}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.planetTag, { color: locked ? colors.textFaint : planet.color }]}>
          {t('planets.planetTag', { number: planet.number })}
        </Text>
        <Text style={styles.planetTitle}>{planet.title}</Text>
        <Text style={styles.planetSubtitle} numberOfLines={1}>
          {planet.subtitle}
        </Text>
        {!locked && (
          <View style={styles.planetProgressRow}>
            <View style={{ flex: 1 }}>
              <GradientBar value={mastery / 100} colors={[planet.color, planet.color]} trackColor={colors.surface} height={6} />
            </View>
            <Text style={[styles.planetPct, { color: planet.color }]}>{mastery}%</Text>
          </View>
        )}
      </View>
      {locked ? (
        <View style={styles.lockBadge}>
          <Lock size={16} color={colors.textFaint} />
        </View>
      ) : (
        <ChevronRight size={20} color={colors.textFaint} />
      )}
    </Card>
  );
}

export function PlanetsHomeScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { openPlanet } = useUiStore();
  const { data: planets = [], isLoading } = usePlanets();
  const { data: cards = [] } = useFlashcards();
  const { data: gamification } = useGamificationStats();
  const [celebratingId, setCelebratingId] = useState<string | null>(null);

  const firstName = displayName(user);
  const initial = (firstName[0] ?? 'H').toUpperCase();
  const streak = gamification?.streak_days ?? 0;

  // Celebrate planets that became available since the last time the list was
  // seen. Planet ids are per-course, and a planet only ever leaves "locked"
  // once per course — persisting the celebrated ids means the ring + orb play
  // exactly once per unlock, whether it happened in chat or on another visit.
  // Planet 1 is never locked in a fresh course, so only 2+ can be "new".
  useEffect(() => {
    if (isLoading || planets.length === 0) return;
    const seen = readCelebratedIds();
    const fresh = planets.filter((p) => p.number >= 2 && p.status !== 'locked' && !seen.includes(p.id));
    if (fresh.length === 0) return;
    persistCelebratedIds([...seen, ...fresh.map((p) => p.id)]);
    // Celebrate the soonest available one; the rest were announced as seen.
    setCelebratingId(fresh.sort((a, b) => a.number - b.number)[0].id);
  }, [isLoading, planets]);

  const activePlanet = planets.find((p) => p.status === 'active') ?? planets[0];
  const mastery = activePlanet ? Math.round((activePlanet.progress?.mastery ?? 0) * 100) : 0;
  // `listening` is a 0..1 progress ratio from the backend, not a duration —
  // show it as the percentage it actually is.
  const listeningPct = activePlanet ? Math.round((activePlanet.progress?.listening ?? 0) * 100) : 0;
  const sentenceStat = activePlanet
    ? `${activePlanet.mastered_sentences}/${activePlanet.total_sentences}`
    : '0/0';

  const stats = [
    { icon: <MessageSquare size={18} color="#FBBF24" fill="#FBBF24" />, value: sentenceStat, label: t('planets.statSentences') },
    { icon: <AudioLines size={18} color="#C4B5FD" />, value: `${listeningPct}%`, label: t('planets.statListening') },
    { icon: <BookOpen size={18} color="#F97363" />, value: `${cards.length}`, label: t('planets.statFlashcards') },
    { icon: <Star size={18} color="#93C5FD" />, value: `${mastery}%`, label: t('planets.statMastery') },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        right={
          <>
            <View style={styles.streakPill}>
              <Flame size={14} color={streak > 0 ? '#F97316' : colors.textFaint} fill={streak > 0 ? '#F97316' : 'none'} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
            <Pressable style={styles.avatar} onPress={signOut} hitSlop={8}>
              <Text style={styles.avatarText}>{initial}</Text>
            </Pressable>
          </>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{t('home.greeting', { name: firstName || 'there' })}</Text>
            <Text style={styles.greetingSub}>{t('home.subtitle')}</Text>
          </View>
          <Image
            source={require('../../assets/brand/mascot-monkey.png')}
            style={styles.mascotImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <View style={styles.progressTopLeft}>
              <BarChart4 size={16} color="#FFFFFF" />
              <Text style={styles.progressTitle}>{t('planets.yourProgress')}</Text>
            </View>
            <Text style={styles.progressPct}>{mastery}%</Text>
          </View>
          <GradientBar
            value={mastery / 100}
            colors={['#2DD4BF', '#5EEAD4']}
            trackColor="rgba(255,255,255,0.18)"
            height={8}
          />
          <View style={styles.statsRow}>
            {stats.map((s, i) => (
              <View key={s.label} style={[styles.statCol, i > 0 && styles.statColBorder]}>
                {s.icon}
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeaderWrap}>
          <SectionHeader
            title={t('home.yourPlanets')}
            actionLabel={planets[0] ? t('home.seeAll') : undefined}
            onAction={planets[0] ? () => openPlanet(planets[0].id) : undefined}
          />
        </View>

        {!isLoading &&
          planets.map((planet) => (
            <PlanetRow
              key={planet.id}
              planet={planet}
              onPress={() => openPlanet(planet.id)}
              celebrating={planet.id === celebratingId}
              onCelebrationDone={() => setCelebratingId(null)}
            />
          ))}
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
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  streakText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.text,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.body,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  greeting: {
    ...typography.display,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  greetingSub: {
    ...typography.body,
    marginTop: 2,
    color: colors.textMuted,
  },
  mascotImage: {
    width: 118,
    height: 112,
  },
  progressCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.button,
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  progressTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTitle: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressPct: {
    ...typography.body,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statColBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.20)',
  },
  statValue: {
    ...typography.cardTitle,
    marginTop: 5,
    color: '#FFFFFF',
  },
  statLabel: {
    ...typography.caption,
    marginTop: 1,
    color: 'rgba(255,255,255,0.75)',
  },
  sectionHeaderWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  planetRow: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  planetRowLocked: {
    opacity: 0.9,
  },
  // Only a positioning anchor for the celebration overlay — the Card row's
  // own gap already spaces the tile from the text, so no margin here.
  tileWrap: {
    position: 'relative',
  },
  planetTag: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  planetTitle: {
    ...typography.section,
    color: colors.text,
  },
  planetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  planetProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  planetPct: {
    ...typography.caption,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'right',
  },
  lockBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
