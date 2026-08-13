import { Check, ChevronDown, ChevronUp, Lock, Orbit } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { usePlanet, usePlanets } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { PlanetOrb } from '../components/PlanetOrb';
import { PlanetUnlockCelebration } from '../components/PlanetUnlockCelebration';
import { useT, type TranslationKey } from '../i18n';
import { BlockIcon } from '../planets/blockIcons';
import { storage, StorageKeys } from '../storage';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import {
  currentPlanet,
  isBlockDone,
  isPlanetFinished,
  type Planet,
  type PlanetLesson,
} from '../types';

// ---------------------------------------------------------------------------
// Celebration bookkeeping (a planet only unlocks once per course)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Block state → the row's label, colour and right-hand affordance
// ---------------------------------------------------------------------------

type BlockLook = {
  labelKey: TranslationKey;
  tint: string;
  iconBg: string;
  /** Only the block the learner is on gets the orange rail and the CTA. */
  current: boolean;
  done: boolean;
  locked: boolean;
};

function lookForBlock(block: PlanetLesson): BlockLook {
  switch (block.state) {
    case 'completed':
      return {
        labelKey: 'state.completed',
        tint: colors.primary,
        iconBg: colors.primarySoft,
        current: false,
        done: true,
        locked: false,
      };
    case 'flashcards_pending':
      return {
        labelKey: 'state.flashcardsPending',
        tint: colors.brand.orange,
        iconBg: '#FFEEDD',
        current: true,
        done: false,
        locked: false,
      };
    case 'current':
      return {
        labelKey: 'state.inProgress',
        tint: colors.brand.orange,
        iconBg: '#FFEEDD',
        current: true,
        done: false,
        locked: false,
      };
    default:
      return {
        labelKey: 'state.locked',
        tint: colors.textFaint,
        iconBg: colors.surface,
        current: false,
        done: false,
        locked: true,
      };
  }
}

function BlockRow({ block, onPress }: { block: PlanetLesson; onPress: () => void }) {
  const t = useT();
  const look = lookForBlock(block);

  return (
    <View style={[styles.blockRow, look.current && styles.blockRowCurrent]}>
      {/* The orange rail marks where the learner actually is, at a glance. */}
      {look.current && <View style={styles.blockRail} />}
      <View style={[styles.blockIcon, { backgroundColor: look.iconBg }]}>
        <BlockIcon kind={block.kind} color={look.locked ? colors.textFaint : look.tint} />
      </View>
      <View style={styles.blockText}>
        <Text style={[styles.blockTitle, look.locked && styles.blockTitleLocked]} numberOfLines={2}>
          {t('planets.blockTag', { number: block.position })} · {block.title}
        </Text>
        <Text style={[styles.blockState, { color: look.tint }]}>{t(look.labelKey)}</Text>
      </View>

      {look.locked ? (
        <Lock size={18} color={colors.textFaint} />
      ) : look.current ? (
        <Pressable style={styles.continuePill} onPress={onPress} accessibilityRole="button">
          <Text style={styles.continuePillText}>
            {block.state === 'flashcards_pending' ? t('planets.reviewCards') : t('planets.continue')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.checkBadge}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('state.completed')}
        >
          <Check size={14} color={colors.textOnPrimary} strokeWidth={3} />
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Expanded planet card — the planet and its ten blocks inline
// ---------------------------------------------------------------------------

function ExpandedPlanetCard({
  planet,
  open,
  onToggle,
  celebrating,
  onCelebrationDone,
}: {
  planet: Planet;
  /** Whether the block list is showing. The card itself always stays. */
  open: boolean;
  onToggle: () => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
}) {
  const t = useT();
  const { beginLesson } = useUiStore();
  // Only fetch the ten blocks while they are actually on screen.
  const { data: detail, isLoading } = usePlanet(open ? planet.id : undefined);
  const blocks = detail?.lessons ?? [];
  const done = blocks.length > 0 ? blocks.filter((b) => isBlockDone(b.state)).length : planet.completed_blocks;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View style={styles.planetCard}>
      <Pressable
        style={[styles.planetCardHeader, !open && styles.planetCardHeaderClosed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.orbWrap}>
          <PlanetOrb planetNumber={planet.number} color={planet.color} size={82} />
          <View style={styles.numberBadge}>
            <Text style={styles.numberBadgeText}>{planet.number}</Text>
          </View>
          {celebrating && (
            <PlanetUnlockCelebration
              planetNumber={planet.number}
              color={planet.color}
              size={82}
              onDone={onCelebrationDone}
            />
          )}
        </View>
        <View style={styles.planetCardText}>
          <Text style={styles.planetCardTitle} numberOfLines={1}>
            {t('planets.planetTag', { number: planet.number })}
          </Text>
          <Text style={styles.planetCardSubtitle} numberOfLines={1}>
            {planet.title}
          </Text>
          <Text style={styles.planetCardBlocks}>
            {/* The count is the number that matters, so it carries the weight. */}
            <Text style={styles.planetCardBlocksStrong}>{done}</Text>{' '}
            {t('planets.ofBlocksDone', { total: blocks.length || planet.total_blocks })}
          </Text>
        </View>
        <Chevron size={22} color={colors.text} />
      </Pressable>

      {/* Collapsing hides the blocks — never the planet. The card is the
          learner's place on the route, so making it vanish loses them. */}
      {open &&
        (isLoading && blocks.length === 0 ? (
          <Text style={styles.loadingBlocks}>{t('planets.loadingLessons')}</Text>
        ) : (
          blocks.map((block) => (
            <BlockRow key={block.id} block={block} onPress={() => beginLesson(planet.id, block.id)} />
          ))
        ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Collapsed planets, strung along the route
// ---------------------------------------------------------------------------

/** Where each planet sits across the width, cycled so the route snakes. */
const LANES = [0.26, 0.54, 0.78, 0.44] as const;
const ORB_SIZE = 64;
/** Vertical run of the dotted connector between two orbs. */
const SEGMENT_H = 62;

function laneFor(index: number): number {
  return LANES[index % LANES.length];
}

/**
 * One planet on the route, with the dotted thread that reaches it from the
 * previous one. The curve is drawn between the two orbs' *actual* centres —
 * a segment that merely alternates direction leaves the path visibly
 * detached from the planets it is supposed to connect.
 */
function RoutePlanet({
  planet,
  width,
  fromLane,
  toLane,
  onPress,
  celebrating,
  onCelebrationDone,
}: {
  planet: Planet;
  width: number;
  fromLane: number;
  toLane: number;
  onPress: () => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
}) {
  const t = useT();
  const locked = planet.status === 'locked';
  const fx = width * fromLane;
  const tx = width * toLane;

  return (
    <View style={{ height: SEGMENT_H + ORB_SIZE + 18 }}>
      <Svg width={width} height={SEGMENT_H} style={styles.routeSvg} pointerEvents="none">
        <Path
          d={`M ${fx} 0 C ${fx} ${SEGMENT_H * 0.55}, ${tx} ${SEGMENT_H * 0.45}, ${tx} ${SEGMENT_H}`}
          stroke={colors.brand.lavender}
          strokeWidth={2}
          strokeDasharray="2 7"
          strokeLinecap="round"
          fill="none"
          opacity={0.9}
        />
      </Svg>

      <Pressable
        style={[styles.routePlanet, { top: SEGMENT_H - 4, left: tx - ORB_SIZE / 2 }]}
        onPress={locked ? undefined : onPress}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={`${t('planets.planetTag', { number: planet.number })} — ${planet.title}`}
      >
        <View style={styles.orbWrap}>
          <PlanetOrb planetNumber={planet.number} color={planet.color} size={ORB_SIZE} locked={locked} />
          <View style={[styles.numberBadge, styles.numberBadgeSmall]}>
            <Text style={styles.numberBadgeTextSmall}>{planet.number}</Text>
          </View>
          {locked && (
            <View style={styles.lockBadge}>
              <Lock size={11} color={colors.textMuted} />
            </View>
          )}
          {celebrating && (
            <PlanetUnlockCelebration
              planetNumber={planet.number}
              color={planet.color}
              size={ORB_SIZE}
              onDone={onCelebrationDone}
            />
          )}
        </View>
        {/* The arc under each orb reads as the planet's own orbit. */}
        <Svg width={ORB_SIZE + 14} height={16} style={styles.orbitArc} pointerEvents="none">
          <Path
            d={`M 2 2 Q ${(ORB_SIZE + 14) / 2} 20, ${ORB_SIZE + 12} 2`}
            stroke={locked ? colors.border : colors.brand.lavender}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hero — where the learner is right now
// ---------------------------------------------------------------------------

function JourneyHero({ planet }: { planet: Planet }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.lg * 2;
  const mastery = Math.round((planet.progress?.mastery ?? 0) * 100);

  return (
    <View style={styles.hero}>
      {/* The route sweeps behind the ship, so the card reads as a moment on a
          journey rather than a stat panel. */}
      <Svg width={cardWidth} height={150} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroRoute" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.brand.lavender} stopOpacity={0.25} />
            <Stop offset="1" stopColor={colors.brand.lavender} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        {/* The route stays right of the text column: crossing the percentage
            and its bar made both harder to read. */}
        <Path
          d={`M ${cardWidth * 0.42} 136 C ${cardWidth * 0.58} 132, ${cardWidth * 0.72} 86, ${cardWidth + 10} 74`}
          stroke="url(#heroRoute)"
          strokeWidth={2.5}
          fill="none"
        />
        {[
          { f: 0.66, y: 104 },
          { f: 0.82, y: 88 },
          { f: 0.95, y: 78 },
        ].map((n) => (
          <Circle
            key={n.f}
            cx={cardWidth * n.f}
            cy={n.y}
            r={5}
            fill={colors.background}
            stroke={colors.brand.lavender}
            strokeWidth={2}
          />
        ))}
        {/* The orange node is the learner's own position on the route. */}
        <Circle cx={cardWidth * 0.49} cy={125} r={8} fill={colors.brand.orange} />
        <Circle cx={cardWidth * 0.49} cy={125} r={3.2} fill={colors.background} />
      </Svg>

      <View style={styles.heroText}>
        <Text style={styles.heroTitle} numberOfLines={1}>
          {t('planets.planetTag', { number: planet.number })}
        </Text>
        <Text style={styles.heroSubtitle} numberOfLines={1}>
          {planet.title}
        </Text>
        <View style={styles.heroPercentRow}>
          <Text style={styles.heroPercent}>{mastery}</Text>
          <Text style={styles.heroPercentSign}>%</Text>
        </View>
        <Text style={styles.heroProgressLabel}>{t('planets.ofProgress')}</Text>
        <View style={styles.heroTrack}>
          <View style={[styles.heroFill, { width: `${Math.max(3, mastery)}%` }]} />
        </View>
      </View>

      <Image
        source={require('../../assets/brand/mascot-astronaut.png')}
        style={styles.heroMascot}
        resizeMode="contain"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function PlanetsHomeScreen() {
  const t = useT();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { data: planets = [], isLoading } = usePlanets();
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  // Which planet is shown as a card (the rest are orbs on the route), and
  // whether that card's block list is open. Two separate things: closing the
  // blocks must not remove the planet from the journey.
  // `undefined` = not chosen yet, so the current planet takes the card.
  const [cardId, setCardId] = useState<string | undefined>(undefined);
  const [blocksOpen, setBlocksOpen] = useState(true);
  // 60 planets is a long scroll; the route shows where the learner is and
  // what is next, with the whole map one tap away.
  const [fullMap, setFullMap] = useState(false);

  const active = currentPlanet(planets);
  const conquered = planets.filter((p) => isPlanetFinished(p.status)).length;

  // Celebrate planets that became reachable since the list was last seen.
  // Planet ids are per-course and a planet only leaves "locked" once, so
  // persisting the ids keeps the celebration to exactly one play per unlock.
  useEffect(() => {
    if (isLoading || planets.length === 0) return;
    const seen = readCelebratedIds();
    const fresh = planets.filter((p) => p.number >= 2 && p.status !== 'locked' && !seen.includes(p.id));
    if (fresh.length === 0) return;
    persistCelebratedIds([...seen, ...fresh.map((p) => p.id)]);
    setCelebratingId(fresh.sort((a, b) => a.number - b.number)[0].id);
  }, [isLoading, planets]);

  // The current planet takes the card by default — the learner lands on what
  // they are actually doing, not on a list they have to search.
  useEffect(() => {
    if (active && cardId === undefined) setCardId(active.id);
  }, [active, cardId]);

  const visible = useMemo(() => {
    if (fullMap) return planets;
    const anchor = planets.findIndex((p) => p.id === (active?.id ?? ''));
    if (anchor < 0) return planets.slice(0, 6);
    return planets.slice(Math.max(0, anchor - 1), anchor + 5);
  }, [fullMap, planets, active]);

  return (
    <View style={styles.screen}>
      {/* Header: wordmark, title, journey counter */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Image
          source={require('../../assets/brand/logo-wordmark.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headerTitle}>{t('planets.journeyTitle')}</Text>
        <Pressable
          style={styles.counterPill}
          onPress={() => setFullMap((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={fullMap ? t('planets.showFocused') : t('planets.showFullMap')}
        >
          <Text style={styles.counterPillText}>
            {t('planets.journeyCounter', { completed: conquered, total: planets.length || 60 })}
          </Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {active && <JourneyHero planet={active} />}

        {(() => {
          // A card breaks the thread and restarts it from centre; `lane`
          // counts only the planets actually strung along the route, so the
          // curve always leaves the orb it was drawn from.
          let lane = -1;
          return visible.map((planet) => {
            const celebrating = planet.id === celebratingId;
            const onDone = () => setCelebratingId(null);
            if (planet.id === cardId) {
              lane = -1;
              return (
                <ExpandedPlanetCard
                  key={planet.id}
                  planet={planet}
                  open={blocksOpen}
                  onToggle={() => setBlocksOpen((v) => !v)}
                  celebrating={celebrating}
                  onCelebrationDone={onDone}
                />
              );
            }
            const fromLane = lane < 0 ? 0.5 : laneFor(lane);
            lane += 1;
            return (
              <RoutePlanet
                key={planet.id}
                planet={planet}
                width={width}
                fromLane={fromLane}
                toLane={laneFor(lane)}
                onPress={() => {
                  // Opening another planet moves the card there, blocks shown.
                  setCardId(planet.id);
                  setBlocksOpen(true);
                }}
                celebrating={celebrating}
                onCelebrationDone={onDone}
              />
            );
          });
        })()}

        <View style={styles.footerPill}>
          <Orbit size={16} color={colors.primary} />
          <Text style={styles.footerPillStrong}>
            {t('planets.footerCount', { total: planets.length || 60 })}
          </Text>
          <Text style={styles.footerPillText}>· {t('planets.footerHint')}</Text>
        </View>

        {planets.length > visible.length && (
          <Pressable style={styles.mapToggle} onPress={() => setFullMap(true)} accessibilityRole="button">
            <Text style={styles.mapToggleText}>{t('planets.showFullMap')}</Text>
            <ChevronDown size={14} color={colors.primary} />
          </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  logo: {
    width: 92,
    height: 26,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text,
  },
  counterPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  counterPillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  scroll: {
    // Clears the tab bar, whose centre button floats above the bar.
    paddingBottom: 120,
  },

  // Hero
  hero: {
    marginHorizontal: spacing.lg,
    minHeight: 150,
    backgroundColor: colors.authBackground,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroText: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingVertical: spacing.md,
  },
  heroTitle: {
    ...typography.display,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 1,
  },
  heroPercentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  heroPercent: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  heroPercentSign: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 3,
    marginLeft: 1,
  },
  heroProgressLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -2,
  },
  heroTrack: {
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.brand.purpleSoft,
    marginTop: spacing.sm,
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  heroFill: {
    height: '100%',
    borderRadius: radius.round,
    backgroundColor: colors.primary,
  },
  heroMascot: {
    width: 150,
    height: 132,
    marginRight: -spacing.xs,
  },

  // Expanded planet card
  planetCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  planetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  // With the blocks hidden there is nothing below to space away from.
  planetCardHeaderClosed: {
    marginBottom: 0,
  },
  planetCardText: {
    flex: 1,
  },
  planetCardTitle: {
    ...typography.title,
    color: colors.text,
  },
  planetCardSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 1,
  },
  planetCardBlocks: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 5,
  },
  planetCardBlocksStrong: {
    ...typography.cardTitle,
    color: colors.primary,
  },
  loadingBlocks: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  orbWrap: {
    position: 'relative',
  },
  numberBadge: {
    position: 'absolute',
    top: -4,
    left: -6,
    width: 30,
    height: 30,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeSmall: {
    width: 24,
    height: 24,
    top: -6,
    left: -8,
  },
  numberBadgeText: {
    ...typography.cardTitle,
    color: colors.text,
  },
  numberBadgeTextSmall: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.text,
  },
  lockBadge: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Block rows
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  blockRowCurrent: {
    borderColor: colors.brand.orange,
  },
  blockRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.brand.orange,
  },
  blockIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  blockText: {
    flex: 1,
  },
  blockTitle: {
    ...typography.cardTitle,
    color: colors.text,
  },
  blockTitleLocked: {
    color: colors.textMuted,
  },
  blockState: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 1,
  },
  continuePill: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  continuePillText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Route + collapsed planets
  routeSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  routePlanet: {
    position: 'absolute',
    alignItems: 'center',
  },
  orbitArc: {
    marginTop: -8,
  },

  // Footer
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: colors.authBackground,
    borderRadius: radius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: spacing.lg,
  },
  footerPillStrong: {
    ...typography.cardTitle,
    color: colors.text,
  },
  footerPillText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  mapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapToggleText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.primary,
  },
});
