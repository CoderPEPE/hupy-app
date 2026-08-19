import { ArrowRight, AudioLines, Bell, ChevronRight, Copy, Flame, Headphones, MessageSquare, Orbit } from 'lucide-react-native';
import React from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useFlashcards, useGamificationStats, usePlanet, usePlanets, useStories } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { GradientBar } from '../components/GradientBar';
import { Card, ScreenHeader, SectionHeader } from '../components/ui';
import { plural, useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { currentPlanet, isBlockDone, nextBlock } from '../types';
import { displayName } from '../utils/userName';

/** Four-point star used as decoration around the Hupy Live orb. */
function Sparkle({ size = 12, color = colors.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 0 C12.8 8.4 15.6 11.2 24 12 C15.6 12.8 12.8 15.6 12 24 C11.2 15.6 8.4 12.8 0 12 C8.4 11.2 11.2 8.4 12 0 Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Home — the learner's dashboard. It answers three questions at a glance:
 * where am I, what should I do today, and am I keeping the habit.
 * "Continue learning" jumps straight back into the exact block where the
 * learner stopped (chapter intro → chat lesson).
 */
export function HomeScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const { openPlanet, beginLesson, reviewModule, setTab } = useUiStore();
  const { data: planets = [], isLoading } = usePlanets();
  const { data: cards = [] } = useFlashcards();
  const { data: stories = [] } = useStories();
  const { data: gamification } = useGamificationStats();

  const firstName = displayName(user);
  const streak = gamification?.streak_days ?? 0;

  const activePlanet = currentPlanet(planets);
  const { data: detail } = usePlanet(activePlanet?.id);
  const blocks = detail?.lessons ?? [];
  // The module they are on: either its conversation is still to be held, or
  // only its flashcards are left.
  const nextLesson = nextBlock(blocks);

  const mastery = activePlanet ? Math.round((activePlanet.progress?.mastery ?? 0) * 100) : 0;

  const continueLearning = () => {
    if (!activePlanet) return;
    if (nextLesson) {
      // A module that is only waiting on its cards is reviewed on the
      // Flashcards tab — the next module does not open until they are done.
      if (nextLesson.state === 'flashcards_pending') reviewModule(nextLesson.id);
      else beginLesson(activePlanet.id, nextLesson.id);
    } else {
      openPlanet(activePlanet.id);
    }
  };

  // Today's plan reports real counts only — a card with nothing behind it
  // reads as "0 of 0" rather than inventing a target.
  const doneBlocks = blocks.filter((l) => isBlockDone(l.state)).length;
  const reviewedCards = cards.filter((c) => !c.due).length;
  const unlockedStories = stories.filter((s) => s.unlocked).length;
  const playedStories = stories.filter((s) => s.story?.completed).length;

  const plan = [
    {
      key: 'conversation',
      icon: <MessageSquare size={22} color={colors.textOnPrimary} />,
      tint: colors.primary,
      label: t('home.conversation'),
      sub: t('home.lessonsProgress', { done: doneBlocks, total: blocks.length }),
      value: blocks.length > 0 ? doneBlocks / blocks.length : 0,
      onPress: continueLearning,
    },
    {
      key: 'flashcards',
      icon: <Copy size={22} color={colors.textOnPrimary} />,
      tint: colors.brand.orange,
      label: t('home.flashcards'),
      sub: t('home.cardsProgress', { done: reviewedCards, total: cards.length }),
      value: cards.length > 0 ? reviewedCards / cards.length : 0,
      onPress: () => setTab('flashcards'),
    },
    {
      key: 'listening',
      icon: <Headphones size={22} color={colors.textOnPrimary} />,
      tint: colors.brand.lavender,
      label: t('home.listening'),
      sub: t('home.audioProgress', { done: playedStories, total: unlockedStories }),
      value: unlockedStories > 0 ? playedStories / unlockedStories : 0,
      onPress: () => setTab('audio'),
    },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        left={
          <Image
            source={require('../../assets/brand/logo-wordmark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
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
            {/* The dot means something is actually waiting, not decoration. */}
            {cards.some((c) => c.due) && <View style={styles.bellDot} />}
          </Pressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {t('home.hello')} <Text style={styles.greetingName}>{firstName}!</Text> 👋
          </Text>
          <Text style={styles.greetingSub}>{t('home.subtitle')}</Text>
        </View>

        {activePlanet ? (
          <ImageBackground
            source={require('../../assets/brand/hero-space.jpg')}
            style={styles.hero}
            imageStyle={styles.heroImage}
          >
            <View style={styles.heroBody}>
              <View style={styles.planetPill}>
                <Orbit size={14} color={colors.textOnPrimary} strokeWidth={2} />
                <Text style={styles.planetPillText}>
                  {t('planets.planetTag', { number: activePlanet.number })}
                </Text>
              </View>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {activePlanet.title}
              </Text>
              <Text style={styles.heroProgressLabel}>{t('home.progressSummary')}</Text>
              <Text style={styles.heroPercent}>{mastery}%</Text>
              <GradientBar
                value={mastery / 100}
                colors={[colors.brand.indigo, colors.brand.lavender]}
                trackColor="rgba(255,255,255,0.22)"
                height={8}
              />
              <Pressable style={styles.heroCta} onPress={continueLearning} accessibilityRole="button">
                <Text style={styles.heroCtaText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {nextLesson?.state === 'flashcards_pending'
                    ? t('planets.reviewCards')
                    : t('home.continueLearning')}
                </Text>
                <View style={styles.heroCtaIcon}>
                  <ArrowRight size={15} color={colors.textOnPrimary} />
                </View>
              </Pressable>
            </View>
            {/* Sized on the PNG's own 1024x1536 aspect and hung past the card's
                right and bottom edges, so `overflow: hidden` crops the figure
                at the knees the way the design does. */}
            <Image
              source={require('../../assets/brand/mascot-astronaut.png')}
              style={styles.heroMascot}
              resizeMode="contain"
            />
          </ImageBackground>
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.greetingSub}>{isLoading ? t('home.loading') : t('home.noPlanets')}</Text>
          </Card>
        )}

        <View style={styles.sectionWrap}>
          <SectionHeader
            title={t('home.todayPlan')}
            actionLabel={t('home.seeAll')}
            onAction={activePlanet ? () => openPlanet(activePlanet.id) : undefined}
          />
        </View>
        <View style={styles.planRow}>
          {plan.map((p) => (
            <Pressable key={p.key} style={styles.planCard} onPress={p.onPress} accessibilityRole="button">
              <View style={styles.planTop}>
                <View style={[styles.planIcon, { backgroundColor: p.tint }]}>{p.icon}</View>
                <ChevronRight size={16} color={colors.textFaint} />
              </View>
              <Text style={styles.planLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {p.label}
              </Text>
              <Text style={styles.planSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {p.sub}
              </Text>
              <View style={styles.planBarRow}>
                <View style={styles.planBar}>
                  <GradientBar value={p.value} colors={[p.tint, p.tint]} trackColor={colors.surface} height={5} />
                </View>
                <Text style={styles.planPercent}>{Math.round(p.value * 100)}%</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.live} onPress={() => setTab('chat')} accessibilityRole="button">
          <View style={styles.liveBody}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>{t('home.live')}</Text>
            </View>
            <Text style={styles.liveTitle}>{t('tabBar.chat')}</Text>
            <Text style={styles.liveSub}>{t('home.livePitch')}</Text>
            <View style={styles.liveCta}>
              <Text style={styles.liveCtaText}>{t('home.practiceNow')}</Text>
              <ArrowRight size={16} color={colors.textOnPrimary} />
            </View>
          </View>
          {/* Concentric rings and sparkles sit behind the orb as decoration. */}
          <View style={styles.liveArt}>
            <View style={[styles.liveRing, styles.liveRingOuter]} />
            <View style={[styles.liveRing, styles.liveRingInner]} />
            <View style={styles.liveSparkTop}>
              <Sparkle size={13} color={colors.primary} />
            </View>
            <View style={styles.liveSparkBottom}>
              <Sparkle size={10} color={colors.primary} />
            </View>
            <View style={styles.liveGlyph}>
              <AudioLines size={34} color={colors.textOnPrimary} />
              <View style={styles.liveGlyphDot} />
            </View>
          </View>
        </Pressable>

        <Pressable style={styles.streakCard} onPress={() => setTab('profile')} accessibilityRole="button">
          <View style={styles.streakIcon}>
            <Flame size={20} color={colors.brand.orange} fill={streak > 0 ? colors.brand.orange : 'none'} />
          </View>
          <View style={styles.streakLead}>
            <Text style={styles.streakLabel}>{t('home.streakCurrent')}</Text>
            <Text style={styles.streakDays}>
              {t(plural(streak, 'home.dayOne', 'home.dayOther'), { count: streak })}
            </Text>
          </View>
          <View style={styles.streakCopy}>
            <Text style={styles.streakTitle}>{t('home.streakKeepGoing')}</Text>
            <Text style={styles.streakSub} numberOfLines={1}>
              {t('home.streakDoingWell')}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textFaint} />
        </Pressable>
      </ScrollView>

      <AppTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundSoft,
  },
  scroll: {
    // Clears the tab bar's floating centre button, which rides ~30pt above
    // the bar and would otherwise sit on top of the last card.
    paddingBottom: spacing.xl,
  },
  logo: {
    width: 116,
    height: 34,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  bellDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: radius.round,
    backgroundColor: colors.brand.orange,
    borderWidth: 2,
    borderColor: colors.backgroundSoft,
  },
  greetingBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  greeting: {
    ...typography.display,
    color: colors.text,
  },
  greetingName: {
    color: colors.primary,
  },
  greetingSub: {
    ...typography.body,
    fontSize: 15,
    marginTop: spacing.xs,
    color: colors.textMuted,
  },

  // Hero — current planet on a deep-space plate, mascot bleeding off the
  // right and bottom edges.
  hero: {
    height: 225,
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brand.purpleDeep,
    padding: spacing.md,
    overflow: 'hidden',
  },
  heroImage: {
    borderRadius: radius.xl,
  },
  heroBody: {
    // Wide enough for the "Continue learning" pill without running into the
    // mascot, which starts ~178pt in from the card's left edge.
    width: '60%',
  },
  planetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  planetPillText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textOnPrimary,
    marginTop: 10,
  },
  heroProgressLabel: {
    ...typography.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 8,
  },
  heroPercent: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textOnPrimary,
    marginBottom: 6,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 6,
  },
  heroCtaText: {
    ...typography.cardTitle,
    flexShrink: 1,
    color: colors.primary,
  },
  heroCtaIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMascot: {
    // The PNG carries ~13% empty margin on the left, 20% right, 6% top: these
    // offsets cancel that out so the figure itself lands flush with the card's
    // right edge, head 11pt below the top, cropped just above the knees.
    position: 'absolute',
    right: -44,
    top: -10,
    width: 240,
    height: 360,
  },
  emptyCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
  },

  sectionWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  planRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  planCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 10,
    ...shadows.card,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: colors.text,
  },
  planSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
    marginBottom: 8,
  },
  planBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planBar: {
    flex: 1,
  },
  planPercent: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
  },

  // Hupy Live
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brand.purpleWash,
    padding: spacing.md,
    overflow: 'hidden',
  },
  liveBody: {
    flex: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.success,
  },
  livePillText: {
    ...typography.eyebrow,
    fontSize: 10,
    color: colors.text,
  },
  liveTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.primary,
    marginTop: 8,
  },
  liveSub: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 2,
  },
  liveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  liveCtaText: {
    ...typography.cardTitle,
    color: colors.textOnPrimary,
  },
  liveArt: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  liveRing: {
    position: 'absolute',
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: 'rgba(74,68,190,0.16)',
  },
  liveRingOuter: {
    width: 116,
    height: 116,
  },
  liveRingInner: {
    width: 98,
    height: 98,
  },
  liveSparkTop: {
    position: 'absolute',
    top: 6,
    left: 0,
  },
  liveSparkBottom: {
    position: 'absolute',
    bottom: 4,
    right: 6,
  },
  liveGlyph: {
    width: 82,
    height: 82,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveGlyphDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: radius.round,
    backgroundColor: colors.brand.orange,
  },

  // Streak
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 12,
    ...shadows.card,
  },
  streakIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakLead: {
    minWidth: 92,
  },
  streakLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  streakDays: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.brand.orange,
    marginTop: 1,
  },
  streakCopy: {
    flex: 1,
  },
  streakTitle: {
    ...typography.cardTitle,
    color: colors.text,
  },
  streakSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
