import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Headphones,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Square,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGenerateStory, useSaveStoryProgress, useStories } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { PlanetTile } from '../components/PlanetTile';
import { GradientBar } from '../components/GradientBar';
import { Card, ScreenHeader } from '../components/ui';
import { plural, useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import type { PlanetStory, StoryListEntry } from '../types';

/** Words per second used to estimate each unit's duration (≈150 wpm). */
const WPS = 2.5;
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

function unitSecs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WPS));
}

function formatTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Maps an elapsed-time target (seconds) to the unit index it falls in. */
function indexForElapsed(units: string[], elapsed: number): number {
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    const d = unitSecs(units[i]);
    if (elapsed < acc + d) return i;
    acc += d;
  }
  return Math.max(0, units.length - 1);
}

// ---------------------------------------------------------------------------
// Library row
// ---------------------------------------------------------------------------

function StoryRow({
  entry,
  active,
  onOpen,
}: {
  entry: StoryListEntry;
  active: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const { planet, unlocked, story } = entry;
  const generate = useGenerateStory();
  const [generating, setGenerating] = useState(false);

  const doGenerate = () => {
    setGenerating(true);
    generate.mutate(planet.id, { onSettled: () => setGenerating(false) });
  };

  const duration = story?.duration_secs ?? 0;
  const position = story?.position_secs ?? 0;
  const resumed = story && position > 0 && !story.completed;
  // The AI is still writing this one — the list polls until it turns 'ready'.
  const writing = story?.status === 'generating';
  const playable = !!story && !writing;

  return (
    <Card row style={[styles.storyCard, !unlocked && styles.storyCardLocked, active && styles.storyCardActive]} onPress={playable ? onOpen : undefined} disabled={!playable}>
      <PlanetTile planetNumber={planet.number} color={planet.color} size={48} locked={!unlocked} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={[styles.storyPlanetTag, { color: unlocked ? planet.color : colors.textFaint }]}>
          {t('planets.planetTag', { number: planet.number })} · {planet.level}
        </Text>
        <Text style={[styles.storyTitle, !unlocked && styles.storyTitleLocked]} numberOfLines={1}>
          {planet.title}
        </Text>
        {!unlocked ? (
          <Text style={styles.storyMeta}>{t('audio.lockedHint')}</Text>
        ) : writing ? (
          <View style={styles.storyMetaRow}>
            <Sparkles size={11} color={colors.primary} />
            <Text style={styles.storyMeta}>{t('audio.writing')}</Text>
          </View>
        ) : story ? (
          <View style={styles.storyMetaRow}>
            <Clock size={11} color={colors.textMuted} />
            <Text style={styles.storyMeta}>
              {t(plural(Math.max(1, Math.round(duration / 60)), 'audio.minOne', 'audio.minOther'), {
                count: Math.max(1, Math.round(duration / 60)),
              })}{' '}
              · {resumed ? t('audio.resumed') : t('audio.ready')}
            </Text>
          </View>
        ) : (
          <View style={styles.storyMetaRow}>
            <Sparkles size={11} color={colors.primary} />
            <Text style={styles.storyMeta}>{t('audio.awaitingGeneration')}</Text>
          </View>
        )}
      </View>

      {writing ? (
        <Loader2 size={18} color={colors.primary} />
      ) : unlocked && !story ? (
        <Pressable
          style={styles.generateBtn}
          onPress={(e) => {
            // Nested inside the Card's onPress — don't also open the player.
            e.stopPropagation();
            doGenerate();
          }}
          disabled={generating}
          hitSlop={6}
        >
          {generating ? <Loader2 size={15} color={colors.textOnPrimary} /> : <Sparkles size={15} color={colors.textOnPrimary} />}
          <Text style={styles.generateText}>{generating ? t('audio.generating') : t('audio.generate')}</Text>
        </Pressable>
      ) : unlocked ? (
        <View style={styles.playBadge}>
          {resumed ? <RotateCcw size={16} color={colors.textOnPrimary} /> : <Play size={16} color={colors.textOnPrimary} fill={colors.textOnPrimary} />}
        </View>
      ) : (
        <Lock size={16} color={colors.textFaint} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function StoryPlayer({ entry, onClose }: { entry: StoryListEntry; onClose: () => void }) {
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

  const changeSpeed = (s: (typeof SPEEDS)[number]) => {
    speedRef.current = s;
    setSpeed(s);
  };

  const current = units[index] ?? '';
  const currentTranslation = translation[index] ?? '';

  if (!story) return null;

  return (
    <Card style={styles.playerCard}>
      <View style={styles.playerHeader}>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.back')}>
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.playerEyebrow}>
            {t('planets.planetTag', { number: entry.planet.number })} · {entry.planet.level}
          </Text>
          <Text style={styles.playerTitle} numberOfLines={1}>
            {story.title}
          </Text>
        </View>
        <Headphones size={20} color={colors.primary} />
      </View>

      {/* Progress */}
      <View style={styles.progressBlock}>
        <GradientBar value={totalSecs ? elapsed / totalSecs : 0} colors={[colors.primary, '#5BB4A4']} height={8} />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(elapsed)}</Text>
          <Text style={styles.timeText}>{formatTime(totalSecs)}</Text>
        </View>
      </View>

      {/* Transcript */}
      <View style={styles.transcriptCard}>
        <Text style={styles.transcriptUnit} numberOfLines={3}>
          {current}
        </Text>
        {showTranslation && currentTranslation ? (
          <Text style={styles.transcriptTranslation}>{currentTranslation}</Text>
        ) : null}
      </View>

      {/* Transport controls — big, easy to reach while driving */}
      <View style={styles.controlsRow}>
        <Pressable style={styles.skipBtn} onPress={() => seekTo(elapsedRef.current - 15)} hitSlop={6}>
          <RotateCcw size={20} color={colors.text} />
          <Text style={styles.skipLabel}>15</Text>
        </Pressable>
        <Pressable style={[styles.playBig, playing && styles.playBigActive]} onPress={togglePlay} hitSlop={6}>
          {playing ? (
            <Square size={26} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
          ) : (
            <Play size={28} color={colors.textOnPrimary} fill={colors.textOnPrimary} style={{ marginLeft: 3 }} />
          )}
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={() => seekTo(elapsedRef.current + 15)} hitSlop={6}>
          <RotateCw size={20} color={colors.text} />
          <Text style={styles.skipLabel}>15</Text>
        </Pressable>
      </View>

      {/* Speed + translation toggles */}
      <View style={styles.toggleRow}>
        <View style={styles.speedGroup}>
          {SPEEDS.map((s) => (
            <Pressable
              key={s}
              onPress={() => changeSpeed(s)}
              style={[styles.speedChip, speed === s && styles.speedChipActive]}
            >
              <Text style={[styles.speedText, speed === s && styles.speedTextActive]}>{s}×</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => setShowTranslation((v) => !v)}
          style={[styles.translationToggle, showTranslation && styles.translationToggleActive]}
        >
          <Text style={[styles.translationToggleText, showTranslation && styles.translationToggleTextActive]}>
            {t('audio.translation')}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AudioScreen() {
  const t = useT();
  const { data: entries = [], isLoading } = useStories();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = entries.find((e) => e.planet.id === selectedId) ?? null;
  const generated = entries.filter((e) => e.story && e.story.status !== 'generating').length;

  const unlockCount = useMemo(() => {
    const generatedIds = new Set(entries.filter((e) => e.story).map((e) => e.planet.id));
    return entries.filter((e) => e.unlocked && !generatedIds.has(e.planet.id)).length;
  }, [entries]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('audio.title')}
        subtitle={t('audio.subtitle', { count: generated })}
        left={
          <View style={styles.headerIcon}>
            <Headphones size={22} color={colors.primary} />
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {isLoading && entries.length === 0 ? (
          <View style={styles.centerState}>
            <Loader2 size={26} color={colors.textFaint} />
            <Text style={styles.centerText}>{t('audio.loading')}</Text>
          </View>
        ) : (
          <>
            {selected && selected.story && selected.story.status !== 'generating' && (
              <StoryPlayer entry={selected} onClose={() => setSelectedId(null)} />
            )}

            {unlockCount > 0 && (
              <Text style={styles.sectionLabel}>{t('audio.readyToGenerate')}</Text>
            )}
            {entries.map((entry) => (
              <StoryRow key={entry.planet.id} entry={entry} active={selectedId === entry.planet.id} onOpen={() => setSelectedId(entry.planet.id)} />
            ))}

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
    backgroundColor: colors.background,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
  sectionLabel: {
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  storyCard: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  storyCardLocked: {
    opacity: 0.75,
  },
  storyCardActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  storyPlanetTag: {
    ...typography.eyebrow,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  storyTitle: {
    ...typography.section,
    color: colors.text,
    marginTop: 1,
  },
  storyTitleLocked: {
    color: colors.textFaint,
  },
  storyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  storyMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: spacing.sm,
  },
  generateText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  playBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    ...shadows.button,
  },
  footerNote: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textFaint,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  playerCard: {
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerEyebrow: {
    ...typography.eyebrow,
    fontSize: 9,
    color: colors.primary,
  },
  playerTitle: {
    ...typography.section,
    fontSize: 15,
    color: colors.text,
    marginTop: 1,
  },
  progressBlock: {
    marginTop: spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  transcriptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    minHeight: 76,
  },
  transcriptUnit: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'center',
  },
  transcriptTranslation: {
    ...typography.body,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  skipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '800',
    color: colors.primary,
    bottom: 9,
  },
  playBig: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
  },
  playBigActive: {
    backgroundColor: colors.primaryPressed,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  speedGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  speedChip: {
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  speedChipActive: {
    backgroundColor: colors.primary,
  },
  speedText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  speedTextActive: {
    color: colors.textOnPrimary,
  },
  translationToggle: {
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  translationToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  translationToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  translationToggleTextActive: {
    color: colors.primary,
  },
});
