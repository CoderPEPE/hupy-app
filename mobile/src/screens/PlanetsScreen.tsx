import {
  AudioWaveform,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Loader2,
  Lock,
  MessageCircle,
  Pause,
  Play,
  Repeat,
  Rocket,
  Shuffle,
  Star,
  Trophy,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useFlashcards, usePlanet, usePlanets } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { GradientBar } from '../components/GradientBar';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { StateChip } from '../components/StateChip';
import { StreakXpBar } from '../components/StreakXpBar';
import { plural, useT, type TranslationKey } from '../i18n';
import {
  levelVisualStyle,
  planetImageSource,
  visualLevelForPlanet,
} from '../planets/planetLevels';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { radius, spacing } from '../theme';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import { isBlockDone, nextBlock, type Planet, type PlanetDetail, type PlanetLesson } from '../types';

// ---------------------------------------------------------------------------
// Space palette (the planets tab is a full dark scene)
// ---------------------------------------------------------------------------

const SPACE_BG = '#0B0E24';
const SPACE_CARD = 'rgba(23,27,55,0.72)';
const SPACE_CARD_BORDER = 'rgba(255,255,255,0.09)';
const SPACE_ACCENT = '#8B7CF6';
const SPACE_ACCENT_DEEP = '#4A63D9';
const SPACE_TEXT = '#FFFFFF';
const SPACE_TEXT_MUTED = 'rgba(255,255,255,0.55)';
const SPACE_TEXT_FAINT = 'rgba(255,255,255,0.30)';
const GOLD = '#C9A227';
const GOLD_DEEP = '#8B6A1F';

/** Audio-mode labels for one course. The base→target chip is built from the
 * planet's course pair instead of a hardcoded "PT → EN": Portuguese speakers
 * see "PT → EN", Spanish speakers "ES → EN" or "ES → PT", English speakers
 * "EN → ES" or "EN → PT". */
function audioModeLabels(
  t: ReturnType<typeof useT>,
  baseLanguage: string,
  language: string,
): string[] {
  const base = baseLanguage.toUpperCase();
  const target = language.toUpperCase();
  return [
    t('planets.audioModeLanguageOnly'),
    t('planets.audioModeLanguagePause'),
    `${base} → ${target}`,
    t('planets.audioModeRandom'),
    t('planets.audioModeHardReview'),
  ];
}

// ---------------------------------------------------------------------------
// Tiny deterministic helpers (stars, craters, debris — stable across renders)
// ---------------------------------------------------------------------------

function seededRandom(seed: number) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: number, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

const lighten = (hex: string, t: number) => mix(hex, 255, t);
const darken = (hex: string, t: number) => mix(hex, 0, t);

function starsFor(seed: number, count: number) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    r: 0.6 + rand() * 1.6,
    o: 0.25 + rand() * 0.6,
  }));
}

function debrisFor(planetNumber: number) {
  const rand = seededRandom(planetNumber * 131);
  return Array.from({ length: 5 }, () => ({
    left: rand() * 100,
    top: 20 + rand() * 70,
    size: 6 + rand() * 10,
    o: 0.3 + rand() * 0.4,
  }));
}

// Rocks that float around the planet art (the reference shows the planet
// surrounded by craters and rocks). Positions are in % of the showcase box,
// sized so they ring the planet disc without overlapping it.
function rocksFor(planetNumber: number) {
  const rand = seededRandom(planetNumber * 313);
  // Spots avoid the purple arrow buttons (which sit at ~42% height, left/right
  // edges) so the rocks stay visible around the planet disc.
  const spots = [
    { left: 6, top: 30 },
    { left: 91, top: 30 },
    { left: 13, top: 6 },
    { left: 86, top: 62 },
    { left: 8, top: 90 },
    { left: 89, top: 92 },
    { left: 47, top: 2.5 },
  ];
  return spots.map((s) => ({
    left: s.left + (rand() - 0.5) * 4,
    top: Math.max(1, s.top + (rand() - 0.5) * 6),
    size: 7 + rand() * 10,
    o: 0.3 + rand() * 0.45,
  }));
}

// ---------------------------------------------------------------------------
// Planet orb (SVG fallback when no PNG art exists)
// ---------------------------------------------------------------------------

function PlanetOrb({
  planet,
  size,
  locked,
  floatAnim,
}: {
  planet: Planet;
  size: number;
  locked: boolean;
  floatAnim: Animated.Value;
}) {
  const color = locked ? '#3A3F55' : planet.color;
  const isSaturn = planet.number === 6;
  const craters = useMemo(() => {
    const rand = seededRandom(planet.number * 7919);
    return Array.from({ length: 4 + (planet.number % 4) }, () => ({
      cx: size * (0.2 + rand() * 0.6),
      cy: size * (0.22 + rand() * 0.56),
      r: size * (0.04 + rand() * 0.075),
      o: 0.12 + rand() * 0.22,
    }));
  }, [planet.number, size]);
  const debris = useMemo(() => debrisFor(planet.number), [planet.number]);
  const gradId = `orbGrad-${planet.number}`;
  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.orbGlow,
          {
            top: -size * 0.125,
            left: -size * 0.125,
            width: size * 1.25,
            height: size * 1.25,
            borderRadius: size * 0.625,
            backgroundColor: locked ? 'rgba(80,86,120,0.28)' : `${color}44`,
            transform: [{ translateY }],
          },
        ]}
      />
      {!locked &&
        debris.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              borderRadius: d.size / 2,
              backgroundColor: `rgba(255,255,255,${d.o * 0.5})`,
              borderWidth: 1,
              borderColor: `rgba(255,255,255,${d.o * 0.8})`,
              transform: [{ translateY }],
            }}
          />
        ))}
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={gradId} cx="35%" cy="30%" r="80%">
              <Stop offset="0%" stopColor={lighten(color, 0.55)} />
              <Stop offset="40%" stopColor={lighten(color, 0.12)} />
              <Stop offset="100%" stopColor={darken(color, 0.45)} />
            </RadialGradient>
          </Defs>
          {isSaturn && !locked && (
            <G rotation={-24} origin={`${size / 2}, ${size / 2}`}>
              <Ellipse
                cx={size / 2}
                cy={size / 2}
                rx={size * 0.78}
                ry={size * 0.24}
                stroke={lighten(color, 0.35)}
                strokeWidth={size * 0.05}
                fill="none"
                opacity={0.85}
              />
            </G>
          )}
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
          {craters.map((c, i) => (
            <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={darken(color, 0.3)} opacity={c.o} />
          ))}
          <Ellipse
            cx={size * 0.36}
            cy={size * 0.3}
            rx={size * 0.2}
            ry={size * 0.1}
            fill="#FFFFFF"
            opacity={0.16}
            transform={`rotate(-28 ${size * 0.36} ${size * 0.3})`}
          />
        </Svg>
        {locked && (
          <View
            style={[
              styles.lockBadge,
              {
                top: size * 0.29,
                left: size * 0.29,
                width: size * 0.42,
                height: size * 0.42,
                borderRadius: size * 0.21,
              },
            ]}
          >
            <Lock size={size * 0.2} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Progress card (Your progress + 4 stat columns, gradient bar)
// ---------------------------------------------------------------------------

function ProgressCard({
  detail,
  planet,
  cardCount,
}: {
  detail: PlanetDetail | undefined;
  planet: Planet;
  cardCount: number;
}) {
  const t = useT();
  const locked = planet.status === 'locked';
  const mastery = detail?.progress.mastery ?? planet.progress.mastery ?? 0;
  const stats = [
    {
      icon: <MessageCircle size={18} color="#F472B6" />,
      value: `${detail?.mastered_sentences ?? planet.mastered_sentences}/${detail?.total_sentences ?? planet.total_sentences}`,
      label: t('planets.statSentences'),
    },
    {
      icon: <AudioWaveform size={18} color="#22D3EE" />,
      // `listening` is a 0..1 progress ratio from the backend, not a
      // duration — show it as the percentage it actually is.
      value: `${Math.round((detail?.progress.listening ?? planet.progress.listening) * 100)}%`,
      label: t('planets.statListening'),
    },
    {
      icon: <BookOpen size={18} color="#FBBF24" />,
      value: `${cardCount}`,
      label: t('planets.statFlashcards'),
    },
    {
      icon: <Star size={18} color="#A78BFA" />,
      value: `${Math.round(mastery * 100)}%`,
      label: t('planets.statMastery'),
    },
  ];

  // The brief asks for all seven indicators. These three are the tutor's
  // qualitative judgment calls, tracked per planet in the same progress row —
  // shown as bars rather than a 7-column strip, which would squeeze the labels.
  const judged = [
    { label: t('planets.statPronunciation'), value: detail?.progress.pronunciation ?? planet.progress.pronunciation },
    { label: t('planets.statConversation'), value: detail?.progress.conversation ?? planet.progress.conversation },
    { label: t('planets.statReview'), value: detail?.progress.review ?? planet.progress.review },
  ];

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressTop}>
        <View style={styles.progressTopLeft}>
          <Trophy size={16} color={SPACE_ACCENT} />
          <Text style={styles.progressTitle}>{locked ? t('planets.unlockProgress') : t('planets.yourProgress')}</Text>
        </View>
        <Text style={styles.progressPct}>
          {locked ? `${Math.round(planet.unlock_progress * 100)}%` : `${Math.round(mastery * 100)}%`}
        </Text>
      </View>
      <GradientBar
        value={locked ? planet.unlock_progress : mastery}
        colors={locked ? ['#3A3F55', '#2A2F47'] : [SPACE_ACCENT, SPACE_ACCENT_DEEP]}
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

      <View style={styles.judgedRows}>
        {judged.map((j) => (
          <View key={j.label} style={styles.judgedRow}>
            <Text style={styles.judgedLabel} numberOfLines={1}>
              {j.label}
            </Text>
            <View style={styles.judgedBar}>
              <GradientBar value={j.value} height={5} />
            </View>
            <Text style={styles.judgedValue}>{Math.round(j.value * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The ten-block path, with golden bases
// ---------------------------------------------------------------------------

function LessonRow({
  lesson,
  isLast,
  onPress,
}: {
  lesson: PlanetLesson;
  isLast: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const state = lesson.state;
  const locked = state === 'locked';
  const done = isBlockDone(state);
  // The conversation is behind them and only the module's cards are left —
  // a call to action, not a failure.
  const needsReview = state === 'flashcards_pending';
  const circleColor = needsReview ? GOLD : done ? '#27AE60' : SPACE_ACCENT;

  return (
    <View style={styles.lessonRow}>
      {/* rail + golden mechanical base + numbered circle */}
      <View style={styles.lessonRail}>
        {!isLast && (
          <Svg width={46} height={110} style={styles.lessonWinding}>
            <Path
              d="M23,46 C 31,64 15,86 23,110"
              stroke={locked ? SPACE_TEXT_FAINT : SPACE_ACCENT}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              opacity={0.75}
            />
          </Svg>
        )}
        <View style={styles.lessonBase}>
          <View style={styles.lessonBaseRing} />
          <View
            style={[
              styles.lessonCircle,
              !locked && { backgroundColor: circleColor, borderColor: lighten(circleColor, 0.5) },
              locked && { backgroundColor: '#2A2F47', borderColor: '#383E58' },
            ]}
          >
            {locked ? (
              <Lock size={15} color="rgba(255,255,255,0.5)" />
            ) : (
              <Text style={styles.lessonCircleText}>{lesson.position}</Text>
            )}
          </View>
          {done && !needsReview && (
            <View style={styles.checkBadge}>
              <Check size={9} color="#FFFFFF" strokeWidth={3.5} />
            </View>
          )}
        </View>
      </View>

      {/* block card */}
      <View style={styles.lessonCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lessonCardTitle}>
            {lesson.position}. {lesson.title}
          </Text>
          <Text style={styles.lessonCardDesc}>{lesson.description}</Text>
          <View style={{ marginTop: 5 }}>
            <StateChip block={state} dark />
          </View>
        </View>
        <Pressable
          onPress={locked ? undefined : onPress}
          style={[
            styles.lessonPill,
            done && !needsReview && styles.lessonPillDone,
            needsReview && styles.lessonPillReview,
            !done && !locked && styles.lessonPillCurrent,
            locked && styles.lessonPillLocked,
          ]}
          disabled={locked}
        >
          {locked && <Lock size={12} color={SPACE_TEXT_FAINT} />}
          <Text
            style={[
              styles.lessonPillText,
              done && !needsReview && styles.lessonPillTextDone,
              locked && { color: SPACE_TEXT_FAINT },
            ]}
          >
            {needsReview
              ? t('planets.startReview')
              : done
                ? t('planets.completed')
                : locked
                  ? t('planets.locked')
                  : t('planets.continue')}
          </Text>
          {!locked && (
            <ChevronRight size={14} color={done && !needsReview ? '#1E7A43' : '#FFFFFF'} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Continuous audio panel (for the car / commute)
// ---------------------------------------------------------------------------

/** Silence between the two listens of a sentence in "English + pause" mode —
 * long enough to actually say it back before the tutor moves on. */
const REPEAT_PAUSE_MS = 2500;

function AudioPanel({ detail, planet }: { detail: PlanetDetail | undefined; planet: Planet }) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState(0);
  const modeLabels = audioModeLabels(t, planet.base_language, planet.language);
  // The learner's chosen tutor voice speaks the continuous audio too; falls
  // back to the course default when none was picked.
  const voice = effectiveVoice(user?.voice ?? '', planet.language);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [nowText, setNowText] = useState(t('planets.tapToListen'));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Breaks the mode-1 sequencer loop out of its awaits when stopped/unmounted.
  const cancelRef = useRef(false);

  const sentences = detail?.sentences ?? [];

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      speechPlayer.stop();
    };
  }, []);

  const script = useMemo(() => {
    const en = sentences.map((s) => s.en);
    const pt = sentences.map((s) => s.pt);
    switch (mode) {
      case 2: {
        const parts: string[] = [];
        sentences.forEach((s) => parts.push(s.pt, s.en));
        return parts.join('. ');
      }
      case 3:
        return [...en].sort(() => Math.random() - 0.5).join('. ');
      case 4:
        return sentences.filter((s) => !s.mastered).map((s) => s.en).join('. ') || en.join('. ');
      default:
        return en.join('. ');
    }
  }, [sentences, mode]);

  const stopPlayback = () => {
    cancelRef.current = true;
    speechPlayer.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setPlaying(false);
    setProgress(0);
    setNowText(t('planets.tapToListen'));
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** Mode 1 — "English + pause": hear each sentence, a real silent gap to
   * repeat it, then hear it again before moving on. Sequenced per-sentence
   * (rather than one big joined clip) so an actual pause can be inserted. */
  const playPauseForRepeat = async () => {
    cancelRef.current = false;
    setPlaying(true);
    setProgress(0);
    const total = sentences.length;
    for (let i = 0; i < total; i++) {
      if (cancelRef.current) return;
      const s = sentences[i];
      setNowText(`“${s.en}…”`);
      const heard = await speechPlayer.speak(s.en, voice);
      if (cancelRef.current) return;
      if (heard > 0) {
        setNowText(t('planets.yourTurn'));
        await sleep(REPEAT_PAUSE_MS);
        if (cancelRef.current) return;
        setNowText(`“${s.en}…”`);
        await speechPlayer.speak(s.en, voice);
        if (cancelRef.current) return;
      }
      setProgress((i + 1) / Math.max(total, 1));
    }
    if (!cancelRef.current) {
      setPlaying(false);
      setNowText(t('planets.tapToListen'));
    }
  };

  const togglePlay = async () => {
    if (playing) {
      stopPlayback();
      return;
    }
    if (sentences.length === 0) return;

    if (mode === 1) {
      playPauseForRepeat();
      return;
    }

    setPlaying(true);
    setProgress(0);
    const duration = await speechPlayer.speak(script, voice);
    if (duration <= 0) {
      setPlaying(false);
      setNowText(t('planets.couldNotLoadAudio'));
      return;
    }
    setNowText(
      mode === 2 && sentences[0]
        ? `“${sentences[0].pt} — ${sentences[0].en}…”`
        : sentences[0]
          ? `“${sentences[0].en}…”`
          : t('planets.listening'),
    );
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / (duration * 1000));
      setProgress(p);
      if (p >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPlaying(false);
        setNowText(t('planets.tapToListen'));
      }
    }, 120);
  };

  return (
    <View style={styles.audioCard}>
      <View style={styles.audioTopRow}>
        <Headphones size={16} color={SPACE_ACCENT} />
        <Text style={styles.audioTitle}>{t('planets.continuousAudio')}</Text>
        <Text style={styles.audioSub}>
          {t(plural(sentences.length, 'planets.forTheCarOne', 'planets.forTheCarOther'), {
            count: sentences.length,
          })}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
        {modeLabels.map((label, i) => (
          <Pressable
            key={label}
            onPress={() => setMode(i)}
            style={[styles.modeChip, i === mode && styles.modeChipActive]}
          >
            {i === 2 ? (
              <Repeat size={11} color={i === mode ? SPACE_ACCENT : SPACE_TEXT_MUTED} />
            ) : i === 3 ? (
              <Shuffle size={11} color={i === mode ? SPACE_ACCENT : SPACE_TEXT_MUTED} />
            ) : null}
            <Text style={[styles.modeChipText, i === mode && { color: SPACE_ACCENT }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.audioControls}>
        <Pressable
          onPress={togglePlay}
          style={styles.playBtn}
          accessibilityLabel={playing ? t('planets.pause') : t('planets.play')}
        >
          {playing ? (
            <Pause size={20} color={SPACE_ACCENT} />
          ) : (
            <Play size={20} color={SPACE_ACCENT} fill={SPACE_ACCENT} />
          )}
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <GradientBar value={progress} height={6} />
          <Text style={styles.audioNow}>{nowText}</Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gradient CTA (purple -> blue pill with play icon)
// ---------------------------------------------------------------------------

function GradientCta({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { width } = useWindowDimensions();
  const ctaWidth = width - spacing.lg * 2;
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} style={styles.ctaWrap}>
      <Svg width={ctaWidth} height={54} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={SPACE_ACCENT} />
            <Stop offset="1" stopColor={SPACE_ACCENT_DEEP} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={ctaWidth} height={54} rx={27} fill={disabled ? 'rgba(255,255,255,0.08)' : 'url(#ctaGrad)'} />
      </Svg>
      <Text style={[styles.ctaText, disabled && { color: SPACE_TEXT_FAINT }]}>{label}</Text>
      <Play size={18} color={disabled ? SPACE_TEXT_FAINT : '#FFFFFF'} fill={disabled ? 'none' : '#FFFFFF'} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function PlanetsScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { width } = useWindowDimensions();
  const { beginLesson, closePlanet, reviewModule, selectedPlanetId } = useUiStore();
  const { data: planets = [], isLoading } = usePlanets();

  const initialIndex = Math.max(0, planets.findIndex((p) => p.id === selectedPlanetId));
  const [index, setIndex] = useState(initialIndex);
  const [audioOpen, setAudioOpen] = useState(false);
  const listRef = useRef<FlatList<Planet>>(null);
  const scrollInFlight = useRef(false);
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Jump the carousel to the planet opened from Home, once planets have
  // loaded (the list is empty on first render while the query is in flight).
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || !selectedPlanetId || planets.length === 0) return;
    const i = planets.findIndex((p) => p.id === selectedPlanetId);
    if (i >= 0) {
      jumpedRef.current = true;
      setIndex(i);
      requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: i, animated: false }));
    }
  }, [planets, selectedPlanetId]);

  const planet = planets[index] ?? null;
  const detailQuery = usePlanet(planet?.id);
  const detail = detailQuery.data;
  const { data: cards = [] } = useFlashcards(planet ? { planetId: planet.id } : undefined);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(planets.length - 1, i));
    if (scrollInFlight.current) return;
    scrollInFlight.current = true;
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    setIndex(clamped);
  };

  const onMomentumEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    scrollInFlight.current = false;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const lessons = detail?.lessons ?? [];
  const nextLesson = nextBlock(lessons);
  const allDone = lessons.length > 0 && lessons.every((l) => isBlockDone(l.state));
  // A module waiting on its flashcards is where the learner must go next —
  // the path does not open past it.
  const reviewBlock = lessons.find((l) => l.state === 'flashcards_pending') ?? null;

  // A module waiting on its cards is reviewed on the Flashcards tab, not in
  // another chat lesson — both the row pill and the sticky CTA land there.
  const openLesson = (lesson: PlanetLesson | null) => {
    if (!lesson) return;
    if (lesson.state === 'flashcards_pending') reviewModule(lesson.id);
    else beginLesson(planet?.id ?? '', lesson.id);
  };
  const locked = planet?.status === 'locked';

  const stars = useMemo(() => starsFor(7, 46), []);

  const subtitleParts = planet ? planet.subtitle.split(' — ') : [];
  const mastery = planet ? Math.round((planet.progress.mastery ?? 0) * 100) : 0;

  const continueLabel = !planet
    ? ''
    : locked
      ? t('planets.locked')
      : detailQuery.isLoading
        ? t('planets.loadingLessons')
        : reviewBlock
          ? t('planets.startReview')
          : allDone
            ? t('planets.planetComplete')
            : t('planets.continueLesson', { position: nextLesson?.position ?? 1 });

  const continueReady = !locked && !detailQuery.isLoading && (!!nextLesson || allDone);
  // "Continuar" must open exactly where the learner stopped (spec §8): the
  // pending review first, then the next unfinished block, then the last one.
  const continueTarget = reviewBlock ?? nextLesson ?? lessons[lessons.length - 1] ?? null;

  return (
    <View style={styles.screen}>
      {/* fixed top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable style={styles.roundBtn} onPress={closePlanet} hitSlop={8} accessibilityLabel={t('planets.back')}>
          <ChevronLeft size={20} color={SPACE_TEXT} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.rocketPill}>
            <Rocket size={13} color={SPACE_ACCENT} />
            <Text style={styles.rocketPillText}>{mastery}%</Text>
          </View>
          <StreakXpBar dark />
        </View>
        <LanguageSwitch dark />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {isLoading || !planet ? (
          <View style={styles.centerState}>
            <Loader2 size={26} color={SPACE_TEXT_FAINT} />
            <Text style={styles.centerText}>{t('planets.traveling')}</Text>
          </View>
        ) : (
          <>
            {/* centered planet header: number, level, name, state, goal and
                blocks — the spec's §8 identity block */}
            <View style={styles.titleBlock}>
              <Text style={styles.planetTag}>
                {t('planets.planetTag', { number: planet.number })} · {planet.level}
              </Text>
              <Text style={styles.planetName}>{planet.title.toUpperCase()}</Text>
              {subtitleParts[0] && <Text style={styles.planetSubtitle}>{subtitleParts[0]}</Text>}
              {planet.goal ? (
                <Text style={styles.planetGoalText}>{planet.goal}</Text>
              ) : (
                subtitleParts[1] && <Text style={styles.planetSubtitleMuted}>{subtitleParts[1]}</Text>
              )}
              <View style={styles.headerMetaRow}>
                <StateChip status={planet.status} dark />
                <Text style={styles.headerBlocks}>
                  {t('planets.blocksOf', {
                    completed: planet.completed_blocks,
                    total: planet.total_blocks,
                  })}
                </Text>
              </View>
              {planet.review_skills.length > 0 && (
                <Text style={styles.headerReview}>
                  {t('planets.reviewSkills', {
                    skills: planet.review_skills
                      .map((s) => t(`skill.${s}` as TranslationKey))
                      .join(', '),
                  })}
                </Text>
              )}
            </View>

            {/* stars + planet showcase */}
            <View style={[styles.showcase, { height: width * 0.72 }]}>
              {stars.map((s, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${s.left}%`,
                    top: `${s.top}%`,
                    width: s.r,
                    height: s.r,
                    borderRadius: s.r / 2,
                    backgroundColor: `rgba(255,255,255,${s.o})`,
                  }}
                />
              ))}

              <FlatList
                ref={listRef}
                data={planets}
                keyExtractor={(p) => p.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
                onMomentumScrollEnd={onMomentumEnd}
                renderItem={({ item }) => {
                  const level = visualLevelForPlanet(item);
                  const art = planetImageSource(item.number, level);
                  const visual = levelVisualStyle(level, item.status === 'locked');
                  const artSize = Math.min(width * 0.58, 240);
                  const rocks = rocksFor(item.number);
                  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] });
                  return (
                    <View style={[styles.page, { width }]}>
                      {art ? (
                        <>
                          {/* floating rocks around the planet */}
                          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                            {rocks.map((r, i) => (
                              <Animated.View
                                key={i}
                                style={{
                                  position: 'absolute',
                                  left: `${r.left}%`,
                                  top: `${r.top}%`,
                                  width: r.size,
                                  height: r.size,
                                  borderRadius: r.size / 2,
                                  backgroundColor: `rgba(255,255,255,${r.o * 0.35})`,
                                  borderWidth: 1,
                                  borderColor: `rgba(255,255,255,${r.o * 0.75})`,
                                  transform: [{ translateY: floatY }],
                                }}
                              />
                            ))}
                          </View>
                          <Animated.View style={{ transform: [{ translateY: floatY }] }}>
                            <Image
                              source={art}
                              style={[
                                styles.planetArt,
                                {
                                  width: artSize,
                                  height: artSize,
                                  borderRadius: artSize / 2,
                                  opacity: visual.opacity,
                                },
                              ]}
                              resizeMode="contain"
                            />
                          </Animated.View>
                        </>
                      ) : (
                        <PlanetOrb
                          planet={item}
                          size={Math.min(width * 0.5, 200)}
                          locked={item.status === 'locked'}
                          floatAnim={floatAnim}
                        />
                      )}
                      {item.status === 'locked' && (
                        <View style={styles.pageLockedBadge}>
                          <Lock size={18} color="rgba(255,255,255,0.9)" />
                        </View>
                      )}
                    </View>
                  );
                }}
              />

              {/* purple arrow buttons */}
              <Pressable
                style={[styles.arrow, styles.arrowLeft, index === 0 && styles.arrowDisabled]}
                onPress={() => goTo(index - 1)}
                disabled={index === 0}
                hitSlop={6}
                accessibilityLabel={t('planets.previousPlanet')}
              >
                <ChevronLeft size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={[styles.arrow, styles.arrowRight, index === planets.length - 1 && styles.arrowDisabled]}
                onPress={() => goTo(index + 1)}
                disabled={index === planets.length - 1}
                hitSlop={6}
                accessibilityLabel={t('planets.nextPlanet')}
              >
                <ChevronRight size={22} color="#FFFFFF" />
              </Pressable>

              {/* dots */}
              <View style={styles.dots}>
                {planets.map((p, i) => (
                  <View
                    key={p.id}
                    style={[
                      styles.dot,
                      i === index && { width: 18, backgroundColor: SPACE_ACCENT },
                      i !== index && { backgroundColor: i < index ? SPACE_TEXT_MUTED : SPACE_TEXT_FAINT },
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* progress card */}
            <View style={styles.body}>
              <ProgressCard detail={detail} planet={planet} cardCount={cards.length} />

              {/* lessons */}
              <View style={styles.lessonsHeader}>
                <Text style={styles.lessonsTitle}>{t('planets.lessons')}</Text>
                <Pressable style={styles.audioToggle} onPress={() => setAudioOpen((o) => !o)} hitSlop={6}>
                  <Headphones size={14} color={audioOpen ? '#FFFFFF' : SPACE_ACCENT} />
                  <Text style={[styles.audioToggleText, audioOpen && { color: '#FFFFFF' }]}>
                    {audioOpen ? t('planets.hideAudio') : t('planets.listenInCar')}
                  </Text>
                </Pressable>
              </View>

              {audioOpen && detail && <AudioPanel detail={detail} planet={planet} />}

              {detailQuery.isLoading && !detail ? (
                <View style={styles.centerState}>
                  <Loader2 size={20} color={SPACE_TEXT_FAINT} />
                  <Text style={styles.centerText}>{t('planets.loadingLessons')}</Text>
                </View>
              ) : (
                <>
                  {lessons.map((l, i) => (
                    <LessonRow
                      key={l.id}
                      lesson={l}
                      isLast={i === lessons.length - 1}
                      onPress={() => openLesson(l)}
                    />
                  ))}
                  {lessons.length === 0 && (
                    <View style={styles.centerState}>
                      <Text style={styles.centerText}>{t('planets.noLessons')}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* sticky gradient continue CTA (always above the tab bar, like the reference) */}
      {planet && (
        <View style={styles.stickyCta}>
          <GradientCta
            label={continueLabel}
            disabled={!continueReady}
            onPress={() => openLesson(continueTarget)}
          />
        </View>
      )}

      <AppTabBar dark />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SPACE_BG,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rocketPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139,124,246,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139,124,246,0.45)',
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 5,
  },
  rocketPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: SPACE_TEXT,
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  planetTag: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#A9A2F7',
  },
  planetName: {
    marginTop: 2,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 2,
    color: SPACE_TEXT,
  },
  planetSubtitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: SPACE_TEXT,
  },
  planetSubtitleMuted: {
    marginTop: 2,
    fontSize: 14,
    color: SPACE_TEXT_MUTED,
    textAlign: 'center',
  },
  planetGoalText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: SPACE_TEXT_MUTED,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  headerBlocks: {
    fontSize: 12,
    fontWeight: '700',
    color: SPACE_TEXT_MUTED,
  },
  headerReview: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '700',
    color: GOLD,
    textAlign: 'center',
  },
  showcase: {
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  planetArt: {
    backgroundColor: SPACE_BG,
  },
  pageLockedBadge: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbGlow: {
    position: 'absolute',
  },
  lockBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    position: 'absolute',
    top: '42%',
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: SPACE_ACCENT,
    borderWidth: 1,
    borderColor: lighten(SPACE_ACCENT, 0.45),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SPACE_ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  arrowLeft: {
    left: spacing.md,
  },
  arrowRight: {
    right: spacing.md,
  },
  arrowDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  progressCard: {
    backgroundColor: SPACE_CARD,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: SPACE_CARD_BORDER,
    padding: spacing.md,
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
    fontSize: 14,
    fontWeight: '700',
    color: SPACE_TEXT,
  },
  progressPct: {
    fontSize: 14,
    fontWeight: '800',
    color: SPACE_ACCENT,
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
    borderLeftColor: 'rgba(255,255,255,0.10)',
  },
  statValue: {
    marginTop: 5,
    fontSize: 16,
    fontWeight: '800',
    color: SPACE_TEXT,
  },
  statLabel: {
    marginTop: 1,
    fontSize: 11,
    color: SPACE_TEXT_MUTED,
  },
  judgedRows: {
    marginTop: spacing.md,
    gap: 6,
  },
  judgedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  judgedLabel: {
    // Fixed share of the row so the three labels line up and the bars all
    // start at the same x — no wrapping, no squeezed bar.
    width: '34%',
    fontSize: 11,
    color: SPACE_TEXT_MUTED,
  },
  judgedBar: {
    flex: 1,
  },
  judgedValue: {
    width: 38,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '700',
    color: SPACE_TEXT,
  },
  lessonsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  lessonsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: SPACE_TEXT,
  },
  audioToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(139,124,246,0.14)',
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  audioToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: SPACE_ACCENT,
  },
  audioCard: {
    backgroundColor: SPACE_CARD,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: SPACE_CARD_BORDER,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  audioTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioTitle: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '800',
    color: SPACE_TEXT,
  },
  audioSub: {
    marginLeft: 'auto',
    fontSize: 12,
    color: SPACE_TEXT_MUTED,
  },
  modeRow: {
    paddingVertical: spacing.sm,
    gap: 6,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 6,
  },
  modeChipActive: {
    backgroundColor: 'rgba(139,124,246,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(139,124,246,0.5)',
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: SPACE_TEXT_MUTED,
  },
  audioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139,124,246,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139,124,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioNow: {
    marginTop: 5,
    fontSize: 12,
    color: SPACE_TEXT_MUTED,
  },
  lessonRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  lessonRail: {
    width: 46,
    alignItems: 'center',
  },
  lessonWinding: {
    position: 'absolute',
    top: 10,
  },
  lessonBase: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    zIndex: 1,
  },
  lessonBaseRing: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: GOLD_DEEP,
    borderWidth: 2,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  lessonCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonCircleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  checkBadge: {
    position: 'absolute',
    top: 30,
    left: 30,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#27AE60',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 2,
    borderColor: SPACE_BG,
  },
  lessonCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SPACE_CARD,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: SPACE_CARD_BORDER,
    padding: spacing.md,
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
  },
  lessonCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: SPACE_TEXT,
  },
  lessonCardDesc: {
    marginTop: 2,
    fontSize: 12,
    color: SPACE_TEXT_MUTED,
  },
  lessonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: spacing.sm,
  },
  lessonPillDone: {
    backgroundColor: 'rgba(39,174,96,0.10)',
    borderWidth: 1,
    borderColor: '#27AE60',
  },
  lessonPillCurrent: {
    backgroundColor: SPACE_ACCENT,
  },
  lessonPillReview: {
    backgroundColor: GOLD_DEEP,
    borderWidth: 1,
    borderColor: GOLD,
  },
  lessonPillLocked: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  lessonPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  lessonPillTextDone: {
    color: '#27AE60',
  },
  stickyCta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  centerText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: SPACE_TEXT_MUTED,
  },
});
