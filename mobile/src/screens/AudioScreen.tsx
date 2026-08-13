import {
  Bell,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Gauge,
  Info,
  Languages,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Sparkles,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePlanets, useSaveStoryProgress, useStories } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { PlanetOrb } from '../components/PlanetOrb';
import { Card, Dropdown, ScreenHeader } from '../components/ui';
import { plural, useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import { formatTime, indexForElapsed, unitSecs, unitStart } from '../voice/storyTiming';
import type { Planet, StoryListEntry } from '../types';

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

// ---------------------------------------------------------------------------
// Player — the hero card plus its action tiles
// ---------------------------------------------------------------------------

function StoryPanel({ entry, planet }: { entry: StoryListEntry; planet: Planet | undefined }) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const saveProgress = useSaveStoryProgress();
  const story = entry.story;
  const voice = effectiveVoice(user?.voice ?? '', user?.language ?? 'en');

  const units = story?.sentences ?? [];
  const translation = story?.translation ?? [];
  const totalSecs = story?.duration_secs ?? units.reduce((a, u) => a + unitSecs(u), 0);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  const indexRef = useRef(0);
  const elapsedRef = useRef(0);
  const speedRef = useRef(1);
  const cancelRef = useRef(false);

  // Start from the saved position exactly where the learner stopped.
  useEffect(() => {
    if (!story) return;
    const start = story.completed ? 0 : Math.min(story.position_secs, totalSecs - 1);
    const i = indexForElapsed(units, start);
    indexRef.current = i;
    elapsedRef.current = start;
    setIndex(i);
    setElapsed(start);
    return () => {
      cancelRef.current = true;
      speechPlayer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const persist = (secs: number, completed = false) => {
    if (!story) return;
    saveProgress.mutate({ planetId: entry.planet.id, positionSecs: Math.round(secs), completed });
  };

  const play = async () => {
    if (!story || playing) return;
    cancelRef.current = false;
    setPlaying(true);
    let i = indexRef.current;
    while (i < units.length) {
      if (cancelRef.current) return;
      indexRef.current = i;
      setIndex(i);
      const text = units[i];
      const est = unitSecs(text) / speedRef.current;
      const dur = await speechPlayer.speak(text, voice, { speed: speedRef.current });
      elapsedRef.current += est;
      setElapsed(Math.round(elapsedRef.current));
      persist(elapsedRef.current);
      if (dur <= 0) await new Promise((r) => setTimeout(r, 350));
      i += 1;
    }
    if (!cancelRef.current) {
      setPlaying(false);
      elapsedRef.current = totalSecs;
      setElapsed(totalSecs);
      persist(totalSecs, true);
    }
  };

  const stopPlayback = () => {
    cancelRef.current = true;
    speechPlayer.stop();
    setPlaying(false);
    persist(elapsedRef.current);
  };

  const seekTo = (target: number) => {
    const clamped = Math.max(0, Math.min(totalSecs, target));
    const wasPlaying = playing;
    cancelRef.current = true;
    speechPlayer.stop();
    const i = indexForElapsed(units, clamped);
    indexRef.current = i;
    elapsedRef.current = clamped;
    setIndex(i);
    setElapsed(Math.round(clamped));
    setPlaying(false);
    // Persist immediately so a pause-then-leave can't lose the position.
    persist(clamped);
    if (wasPlaying) {
      // Restart playback from the new position after a tick.
      setTimeout(() => play(), 60);
    }
  };

  const togglePlay = () => {
    if (playing) stopPlayback();
    else play();
  };

  /** Speed is one tile, not a row of chips — each tap steps to the next rate
   * and the tile shows where you landed. */
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedRef.current = next;
    setSpeed(next);
  };

  const blocksDone = planet?.completed_blocks ?? 0;
  const blocksTotal = planet?.total_blocks ?? 10;
  const minutes = Math.max(1, Math.round(totalSecs / 60));
  const pct = totalSecs ? Math.max(0, Math.min(1, elapsed / totalSecs)) * 100 : 0;

  const current = units[index] ?? '';
  const currentTranslation = translation[index] ?? '';

  return (
    <>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroCopy}>
            {entry.unlocked ? (
              <View style={styles.badge}>
                <View style={styles.badgeCheck}>
                  <Check size={11} color={colors.textOnPrimary} strokeWidth={3} />
                </View>
                <Text style={styles.badgeText}>
                  {t('audio.blocksDone', { done: blocksDone, total: blocksTotal })}
                </Text>
              </View>
            ) : (
              <View style={styles.badge}>
                <Lock size={12} color={colors.primary} />
                <Text style={styles.badgeText}>{t('audio.lockedHint')}</Text>
              </View>
            )}

            <Text style={styles.heroTitle}>{story?.title ?? entry.planet.title}</Text>
            <Text style={styles.heroBody}>{t('audio.heroBody', { count: blocksTotal })}</Text>

            <View style={styles.aiChip}>
              <Sparkles size={13} color={colors.primary} />
              <Text style={styles.aiChipText}>{t('audio.aiGenerated')}</Text>
            </View>
          </View>

          <Image
            source={require('../../assets/brand/mascot-astronaut.png')}
            style={styles.heroArt}
            resizeMode="contain"
          />
        </View>

        {story && (
          <View style={styles.durationRow}>
            <Clock size={15} color={colors.textMuted} />
            <Text style={styles.durationText}>
              {t(plural(minutes, 'audio.minOne', 'audio.minOther'), { count: minutes })}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Stories ship pre-written with the course, so below the rule there
            is either the transport or the reason there is nothing to play. */}
        {!story ? (
          <View style={styles.centerState}>
            <Text style={styles.centerText}>
              {entry.unlocked ? t('audio.notSeeded') : t('audio.lockedBody')}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.resumeLabel}>
              {elapsed > 0 ? t('audio.resumeLabel') : t('audio.startLabel')}
            </Text>

            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${pct}%` }]} />
              <View style={[styles.trackThumb, { left: `${pct}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(elapsed)}</Text>
              <Text style={styles.timeText}>{formatTime(totalSecs)}</Text>
            </View>

            <View style={styles.controls}>
              <TransportButton
                label={t('audio.prevSentence')}
                onPress={() => seekTo(unitStart(units, Math.max(0, index - 1)))}
              >
                <SkipBack size={26} color={colors.brand.purpleDeep} fill={colors.brand.purpleDeep} />
              </TransportButton>

              <TransportButton label={t('audio.back15')} onPress={() => seekTo(elapsedRef.current - 15)}>
                <RotateCcw size={28} color={colors.brand.purpleDeep} />
                <Text style={styles.skipLabel}>15</Text>
              </TransportButton>

              <Pressable
                style={styles.playBig}
                onPress={togglePlay}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={playing ? t('audio.pause') : t('audio.play')}
              >
                {playing ? (
                  <Pause size={30} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
                ) : (
                  <Play size={30} color={colors.textOnPrimary} fill={colors.textOnPrimary} style={{ marginLeft: 3 }} />
                )}
              </Pressable>

              <TransportButton label={t('audio.forward15')} onPress={() => seekTo(elapsedRef.current + 15)}>
                <RotateCw size={28} color={colors.brand.purpleDeep} />
                <Text style={styles.skipLabel}>15</Text>
              </TransportButton>

              <TransportButton
                label={t('audio.nextSentence')}
                onPress={() => seekTo(unitStart(units, Math.min(units.length - 1, index + 1)))}
              >
                <SkipForward size={26} color={colors.brand.purpleDeep} fill={colors.brand.purpleDeep} />
              </TransportButton>
            </View>
          </>
        )}
      </Card>

      {story && (
        <>
          <View style={styles.tileRow}>
            <ActionTile icon={<Gauge size={24} color={colors.primary} />} label={t('audio.speed')} value={`${speed}x`} onPress={cycleSpeed} />
            <ActionTile
              icon={<FileText size={24} color={colors.primary} />}
              label={t('audio.transcript')}
              active={showTranscript}
              onPress={() => setShowTranscript((v) => !v)}
            />
            <ActionTile
              icon={<Languages size={24} color={colors.primary} />}
              label={t('audio.translation')}
              active={showTranslation}
              onPress={() => setShowTranslation((v) => !v)}
            />
          </View>

          {(showTranscript || showTranslation) && (
            <Card style={styles.transcriptCard}>
              {showTranscript && <Text style={styles.transcriptUnit}>{current}</Text>}
              {showTranslation && currentTranslation ? (
                <Text style={styles.transcriptTranslation}>{currentTranslation}</Text>
              ) : null}
            </Card>
          )}
        </>
      )}
    </>
  );
}

function TransportButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.transport} onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.transportIcon}>{children}</View>
      <Text style={styles.transportLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionTile({
  icon,
  label,
  value,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Card style={[styles.tile, active && styles.tileActive]} onPress={onPress}>
      {icon}
      <Text style={styles.tileLabel}>{label}</Text>
      {value ? <Text style={styles.tileValue}>{value}</Text> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AudioScreen() {
  const t = useT();
  const setTab = useUiStore((s) => s.setTab);
  const { data: entries = [], isLoading } = useStories();
  const { data: planets = [] } = usePlanets();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the first planet that actually has a story to play, so the
  // screen opens on something audible rather than on Planet 1's empty state.
  const selected =
    entries.find((e) => e.planet.id === selectedId) ?? entries.find((e) => e.story) ?? entries[0] ?? null;
  const planet = planets.find((p) => p.id === selected?.planet.id);
  const next = selected ? entries[entries.findIndex((e) => e.planet.id === selected.planet.id) + 1] : undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('audio.title')}
        centerTitle
        left={
          <Image source={require('../../assets/brand/logo-wordmark.png')} style={styles.logo} resizeMode="contain" />
        }
        right={
          <Pressable
            style={styles.bell}
            onPress={() => setTab('profile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.profile')}
          >
            <Bell size={20} color={colors.text} />
          </Pressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {isLoading && entries.length === 0 ? (
          <View style={styles.centerState}>
            <Loader2 size={26} color={colors.textFaint} />
            <Text style={styles.centerText}>{t('audio.loading')}</Text>
          </View>
        ) : !selected ? (
          <Text style={styles.footerNote}>{t('audio.footerNote')}</Text>
        ) : (
          <>
            <Dropdown
              value={selected.planet.id}
              onChange={setSelectedId}
              options={entries.map((e) => ({
                value: e.planet.id,
                label: t('planets.planetTag', { number: e.planet.number }),
                icon: '🪐',
              }))}
            />

            <StoryPanel key={selected.planet.id} entry={selected} planet={planet} />

            <Card row style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Info size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>{t('audio.howItWorks')}</Text>
                <Text style={styles.infoBody}>{t('audio.howItWorksBody')}</Text>
              </View>
            </Card>

            {next && (
              <Card row style={styles.nextCard} onPress={() => setSelectedId(next.planet.id)}>
                <View>
                  <PlanetOrb planetNumber={next.planet.number} color={next.planet.color} size={56} />
                  {!next.unlocked && (
                    <View style={styles.nextLock}>
                      <Lock size={12} color={colors.primary} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nextTitle}>{t('planets.planetTag', { number: next.planet.number })}</Text>
                  <Text style={styles.nextBody}>
                    {next.unlocked ? t('audio.nextReadyBody') : t('audio.nextLockedBody', { count: planet?.total_blocks ?? 10 })}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textFaint} />
              </Card>
            )}

            <Text style={styles.footerNote}>{t('audio.footerNote')}</Text>
          </>
        )}
      </ScrollView>

      <AppTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.authBackground,
  },
  logo: {
    width: 96,
    height: 28,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  centerText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
  },
  footerNote: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textFaint,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  // --- Hero -----------------------------------------------------------------
  hero: {
    padding: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
  },
  heroCopy: {
    flex: 1,
  },
  heroArt: {
    width: 116,
    height: 116,
    alignSelf: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.background,
  },
  badgeCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.purpleDeep,
  },
  heroTitle: {
    ...typography.display,
    color: colors.brand.purpleDeep,
    marginTop: spacing.md,
  },
  heroBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
  },
  aiChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.purpleDeep,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  durationText: {
    ...typography.body,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  // --- Transport ------------------------------------------------------------
  resumeLabel: {
    ...typography.cardTitle,
    color: colors.brand.purpleDeep,
    marginBottom: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  trackThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  transport: {
    // Shares whatever the big play button leaves, so five controls still fit
    // on a narrow phone instead of overflowing the card.
    flex: 1,
    alignItems: 'center',
  },
  transportIcon: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '800',
    color: colors.brand.purpleDeep,
  },
  transportLabel: {
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    color: colors.textMuted,
  },
  playBig: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },

  // --- Action tiles ---------------------------------------------------------
  tileRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
  },
  tileActive: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  tileLabel: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.purpleDeep,
    textAlign: 'center',
  },
  tileValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  transcriptCard: {
    padding: spacing.md,
  },
  transcriptUnit: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
  },
  transcriptTranslation: {
    ...typography.body,
    fontSize: 14,
    color: colors.primary,
    marginTop: spacing.sm,
  },

  // --- Info + next planet ---------------------------------------------------
  infoCard: {
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: {
    ...typography.cardTitle,
    color: colors.text,
  },
  infoBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
  },
  nextCard: {
    padding: spacing.md,
    backgroundColor: colors.brand.purpleWash,
  },
  nextLock: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTitle: {
    ...typography.section,
    color: colors.brand.purpleDeep,
  },
  nextBody: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
  },
});
