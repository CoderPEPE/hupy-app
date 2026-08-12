import { ArrowRight, AudioLines, Bell, ChevronRight, Copy, Flame, Headphones, MessageSquare } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFlashcards, useGamificationStats, usePlanet, usePlanets, useStories } from '../api/hooks';
import { AppTabBar } from '../components/AppTabBar';
import { GradientBar } from '../components/GradientBar';
import { RingedPlanetIcon } from '../components/icons/RingedPlanetIcon';
import { Card, ScreenHeader, SectionHeader } from '../components/ui';
import { plural, useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { currentPlanet, isBlockDone, nextBlock } from '../types';
import { displayName } from '../utils/userName';

/**
 * Home — the learner's dashboard. It answers three questions at a glance:
 * where am I, what should I do today, and am I keeping the habit.
 * "Continue learning" jumps straight back into the exact block where the
 * learner stopped (chapter intro → chat lesson).
 */
export function HomeScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const { openPlanet, beginLesson, setTab } = useUiStore();
  const { data: planets = [], isLoading } = usePlanets();
  const { data: cards = [] } = useFlashcards();
  const { data: stories = [] } = useStories();
  const { data: gamification } = useGamificationStats();

  const firstName = displayName(user);
  const streak = gamification?.streak_days ?? 0;

  const activePlanet = currentPlanet(planets);
  const { data: detail } = usePlanet(activePlanet?.id);
  const blocks = detail?.lessons ?? [];
  // A block flagged for review outranks the next new one — the spec's short
  // personalized review comes before more content.
  const reviewBlock = blocks.find((l) => l.state === 'review') ?? null;
  const nextLesson = reviewBlock ?? nextBlock(blocks);

  const mastery = activePlanet ? Math.round((activePlanet.progress?.mastery ?? 0) * 100) : 0;

  const continueLearning = () => {
    if (!activePlanet) return;
    if (nextLesson) {
      beginLesson(activePlanet.id, nextLesson.id);
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
            {t('home.hello')} <Text style={styles.greetingName}>{firstName}!</Text>
          </Text>
          <Text style={styles.greetingSub}>{t('home.subtitle')}</Text>
        </View>

        {activePlanet ? (
          <View style={styles.hero}>
            <View style={styles.heroBody}>
              <View style={styles.planetPill}>
                <RingedPlanetIcon size={14} color={colors.primary} strokeWidth={2} />
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
                colors={[colors.primary, colors.primary]}
                trackColor={colors.card}
                height={7}
              />
              <Pressable style={styles.heroCta} onPress={continueLearning} accessibilityRole="button">
                <Text style={styles.heroCtaText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {reviewBlock ? t('planets.startReview') : t('home.continueLearning')}
                </Text>
                <ArrowRight size={16} color={colors.textOnPrimary} />
              </Pressable>
            </View>
            <Image
              source={require('../../assets/brand/mascot-astronaut.png')}
              style={styles.heroMascot}
              resizeMode="contain"
            />
          </View>
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
              <View style={[styles.planIcon, { backgroundColor: p.tint }]}>{p.icon}</View>
              <Text style={styles.planLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {p.label}
              </Text>
              <Text style={styles.planSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {p.sub}
              </Text>
              <GradientBar value={p.value} colors={[p.tint, p.tint]} trackColor={colors.surface} height={5} />
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
              <Text style={styles.heroCtaText}>{t('home.practiceNow')}</Text>
              <ArrowRight size={16} color={colors.textOnPrimary} />
            </View>
          </View>
          <View style={styles.liveGlyph}>
            <AudioLines size={34} color={colors.textOnPrimary} />
            <View style={styles.liveGlyphDot} />
          </View>
        </Pressable>

        <Pressable style={styles.streakCard} onPress={() => setTab('profile')} accessibilityRole="button">
          <View style={styles.streakIcon}>
            <Flame size={20} color={colors.brand.orange} fill={streak > 0 ? colors.brand.orange : 'none'} />
          </View>
          <View style={styles.streakCopy}>
            <Text style={styles.streakTitle}>
              {t('profile.streak')}:{' '}
              <Text style={styles.streakDays}>
                {t(plural(streak, 'home.dayOne', 'home.dayOther'), { count: streak })}
              </Text>
            </Text>
            <Text style={styles.streakSub} numberOfLines={1}>
              {t('home.streakEncourage')}
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
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.sm,
  },
  logo: {
    width: 116,
    height: 34,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: radius.round,
    backgroundColor: colors.brand.orange,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  greetingBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: 10,
  },
  greeting: {
    ...typography.display,
    fontSize: 25,
    lineHeight: 30,
    color: colors.text,
  },
  greetingName: {
    color: colors.primary,
  },
  greetingSub: {
    ...typography.body,
    fontSize: 14,
    marginTop: 2,
    color: colors.textMuted,
  },

  // Hero — current planet, with the mascot bleeding off the right edge.
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brand.purpleWash,
    padding: 14,
    overflow: 'hidden',
  },
  heroBody: {
    width: '62%',
  },
  planetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  planetPillText: {
    ...typography.label,
    color: colors.text,
  },
  heroTitle: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.primary,
    marginTop: 10,
  },
  heroProgressLabel: {
    ...typography.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
  },
  heroPercent: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 5,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  heroCtaText: {
    ...typography.cardTitle,
    flexShrink: 1,
    color: colors.textOnPrimary,
  },
  // Sized on the PNG's own 853x1280 aspect, anchored to the card's top and
  // taller than the card, so `overflow: hidden` crops the legs the way the
  // design does — head to mid-thigh, whatever the card's height works out to.
  heroMascot: {
    position: 'absolute',
    right: -16,
    top: 2,
    width: 220,
    height: 330,
  },
  emptyCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
  },

  sectionWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: 12,
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.card,
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
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
    marginBottom: 6,
  },

  // Hupy Live
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.brand.purpleWash,
    padding: 14,
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
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.textOnPrimary,
  },
  livePillText: {
    ...typography.eyebrow,
    fontSize: 10,
    color: colors.textOnPrimary,
  },
  liveTitle: {
    fontSize: 20,
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
    marginTop: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  liveGlyph: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderBottomLeftRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  liveGlyphDot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: radius.round,
    backgroundColor: colors.brand.orange,
  },

  // Streak
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: 10,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.card,
  },
  streakIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.round,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakCopy: {
    flex: 1,
  },
  streakTitle: {
    ...typography.cardTitle,
    color: colors.text,
  },
  streakDays: {
    color: colors.brand.orange,
  },
  streakSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
