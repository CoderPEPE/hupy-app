import { BookOpen, Calendar, CheckCircle2, ChevronLeft, Layers, RefreshCw, RotateCcw, Star, Volume2, Loader2 } from 'lucide-react-native';

function CheckCircle2Icon() {
  return <CheckCircle2 size={32} color={colors.success} />;
}
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { AppTabBar } from '../components/AppTabBar';
import { ProgressBar } from '../components/ProgressBar';
import { Card, IconButton, ScreenHeader } from '../components/ui';
import { StreakXpBar } from '../components/StreakXpBar';
import { useFlashcards, usePlanets, useReviewFlashcard } from '../api/hooks';
import { localeTag, plural, useI18nStore, useT, type TranslationKey } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import type { CardRating, Flashcard } from '../types';

/** "Não lembrei" has no separate backend tier (the SRS schedule only knows
 * hard/medium/easy) — it submits the same 'hard' rating as "Difícil" so the
 * UI matches the 4-tier design without changing the review algorithm. */
const RATING_OPTIONS: { value: CardRating; labelKey: TranslationKey; color: string; soft: string }[] = [
  { value: 'hard', labelKey: 'flashcards.ratingForgot', color: colors.rating.forgot, soft: colors.rating.forgotSoft },
  { value: 'hard', labelKey: 'flashcards.ratingHard', color: colors.rating.hard, soft: colors.rating.hardSoft },
  { value: 'medium', labelKey: 'flashcards.ratingMedium', color: colors.rating.almost, soft: colors.rating.almostSoft },
  { value: 'easy', labelKey: 'flashcards.ratingEasy', color: colors.rating.known, soft: colors.rating.knownSoft },
];

function RatingButtons({ card, onRated }: { card: Flashcard; onRated: () => void }) {
  const t = useT();
  const review = useReviewFlashcard();
  const [pendingLabel, setPendingLabel] = useState<TranslationKey | null>(null);

  const rate = (rating: CardRating, labelKey: TranslationKey) => {
    setPendingLabel(labelKey);
    review.mutate(
      { id: card.id, rating },
      {
        onSuccess: onRated,
        onSettled: () => setPendingLabel(null),
      },
    );
  };

  return (
    <View style={styles.ratingRow}>
      {RATING_OPTIONS.map((opt) => {
        const selected = pendingLabel === opt.labelKey;
        return (
          <Pressable
            key={opt.labelKey}
            onPress={() => rate(opt.value, opt.labelKey)}
            disabled={review.isPending}
            style={[styles.ratingBtn, { backgroundColor: selected ? opt.color : opt.soft }]}
          >
            <Text style={[styles.ratingText, { color: selected ? colors.textOnPrimary : opt.color }]}>
              {t(opt.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small forgetting-curve sparkline derived from the card's own SRS state
 * (ease + interval) — not decorative filler, it reflects real retention:
 * a higher ease/interval means the curve decays more slowly. */
const AXIS_KEYS: TranslationKey[] = [
  'flashcards.axisToday',
  'flashcards.axisPlus1',
  'flashcards.axisPlus3',
  'flashcards.axisPlus5',
  'flashcards.axisPlus7',
  'flashcards.axisPlus14',
  'flashcards.axisPlus30',
];

function RetentionGraph({ card }: { card: Flashcard }) {
  const t = useT();
  const w = 180;
  const h = 70;
  const points = useMemo(() => {
    const decay = Math.max(0.15, Math.min(0.9, card.ease / 3));
    const steps = AXIS_KEYS.length;
    return Array.from({ length: steps }, (_, i) => {
      const x = (w / (steps - 1)) * i;
      const progress = i / (steps - 1);
      const y = h - h * (0.1 + decay * (1 - progress) ** 1.6 * 0.85 + (1 - decay) * 0.05);
      return { x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.ease]);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <View style={styles.retentionSection}>
      <Text style={styles.retentionLabel}>{t('flashcards.retention')}</Text>
      <View style={styles.retentionRow}>
        <View style={styles.yAxis}>
          <Text style={styles.axisText}>100%</Text>
          <Text style={styles.axisText}>50%</Text>
          <Text style={styles.axisText}>0%</Text>
        </View>
        <View>
          <Svg width={w} height={h}>
            <SvgPath d={path} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <SvgCircle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2} fill={colors.primary} />
            ))}
          </Svg>
          <View style={styles.xAxis}>
            {AXIS_KEYS.map((key) => (
              <Text key={key} style={styles.axisText}>
                {t(key)}
              </Text>
            ))}
          </View>
        </View>
        <NextReviewBadge card={card} />
      </View>
    </View>
  );
}

function NextReviewBadge({ card }: { card: Flashcard }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const date = new Date(card.next_review_at).toLocaleDateString(localeTag(locale), {
    day: '2-digit',
    month: 'short',
  });
  const days = Math.max(0, Math.ceil((new Date(card.next_review_at).getTime() - Date.now()) / 86400000));
  return (
    <View style={styles.nextReviewBadge}>
      <Text style={styles.nextReviewLabel}>{t('flashcards.nextReview')}</Text>
      <Calendar size={20} color={colors.primary} />
      <Text style={styles.nextReviewDate}>{date.toUpperCase()}</Text>
      <Text style={styles.nextReviewIn}>{t('flashcards.nextReviewIn', { days })}</Text>
    </View>
  );
}

export function FlashcardsScreen() {
  const t = useT();
  const { activeDeckId, openDeck, closeDeck } = useUiStore();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [listening, setListening] = useState(false);
  const [showLearned, setShowLearned] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const { data: cards = [], isLoading } = useFlashcards();
  const { data: planets = [] } = usePlanets();

  const deck = activeDeckId ?? 'all';
  // "Review" = due cards (server SRS ordering: next_review_at asc).
  // "Learned" = cards not currently due, i.e. already reviewed ahead.
  const deckCards = cards.filter(
    (c) => (deck === 'all' || c.planet_id === deck) && (showLearned ? !c.due : c.due),
  );
  const dueCount = cards.filter((c) => (deck === 'all' || c.planet_id === deck) && c.due).length;
  const planetName = (id: string | null) =>
    id ? planets.find((p) => p.id === id)?.title ?? t('flashcards.planetFallback') : t('flashcards.allCards');

  useEffect(() => {
    Animated.timing(flip, {
      toValue: flipped ? 1 : 0,
      duration: 380,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flipped, flip]);

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const card = deckCards[Math.min(index, Math.max(deckCards.length - 1, 0))];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % Math.max(deckCards.length, 1));
  };

  const user = useAuthStore((s) => s.user);

  const listen = async () => {
    if (!card) return;
    setListening(true);
    // Cards hold target-language text, so the learner's tutor voice applies.
    await speechPlayer.speak(card.en, effectiveVoice(user?.voice ?? '', user?.language ?? 'en'));
    setListening(false);
  };

  if (activeDeckId === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title={t('flashcards.header')}
          subtitle={t('flashcards.headerSub')}
          left={
            <View style={styles.headerIcon}>
              <BookOpen size={22} color={colors.primary} />
            </View>
          }
          right={<StreakXpBar />}
        />

        <ScrollView contentContainerStyle={styles.deckList} showsVerticalScrollIndicator={false}>
          <Card row style={styles.deckCard} onPress={() => openDeck('all')}>
            <View style={[styles.deckIcon, { backgroundColor: colors.primarySoft }]}>
              <Layers size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deckName}>{t('flashcards.allCards')}</Text>
              <Text style={styles.deckMeta}>
                {t(plural(cards.length, 'flashcards.cardOne', 'flashcards.cardOther'), { count: cards.length })} ·{' '}
                {t('flashcards.dueNow', { count: cards.filter((c) => c.due).length })}
              </Text>
              <View style={styles.deckProgress}>
                <ProgressBar
                  value={cards.length ? cards.filter((c) => c.due).length / cards.length : 0}
                  color={colors.primary}
                />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
          </Card>

          {planets.map((planet) => {
            const planetCards = cards.filter((c) => c.planet_id === planet.id);
            const planetDue = planetCards.filter((c) => c.due).length;
            return (
              <Card row key={planet.id} style={styles.deckCard} onPress={() => openDeck(planet.id)}>
                <View style={[styles.deckIcon, { backgroundColor: `${planet.color}22` }]}>
                  <BookOpen size={22} color={planet.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deckName}>
                    {t('flashcards.planetDeck', { number: planet.number, title: planet.title })}
                  </Text>
                  <Text style={styles.deckMeta}>
                    {t(plural(planetCards.length, 'flashcards.cardOne', 'flashcards.cardOther'), {
                      count: planetCards.length,
                    })}{' '}
                    · {t('flashcards.dueNow', { count: planetDue })}
                  </Text>
                  <View style={styles.deckProgress}>
                    <ProgressBar
                      value={planetCards.length ? planetDue / planetCards.length : 0}
                      color={planet.color}
                    />
                  </View>
                </View>
                <ChevronLeft size={20} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
              </Card>
            );
          })}

          <Text style={styles.deckTip}>{t('flashcards.tip')}</Text>
        </ScrollView>

        <AppTabBar />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)} onBack={closeDeck} />
        <View style={styles.centerState}>
          <Loader2 size={28} color={colors.textFaint} />
          <Text style={styles.centerText}>{t('flashcards.loadingCards')}</Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)} onBack={closeDeck} />
        <View style={styles.centerState}>
          <BookOpen size={32} color={colors.primary} />
          <Text style={styles.centerTitle}>{t('flashcards.emptyTitle')}</Text>
          <Text style={styles.centerText}>{t('flashcards.emptyBody')}</Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  if (!card) {
    // The deck has cards but nothing is due right now.
    return (
      <View style={styles.screen}>
        <ScreenHeader title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)} onBack={closeDeck} />
        <View style={styles.centerState}>
          <CheckCircle2Icon />
          <Text style={styles.centerTitle}>{t('flashcards.caughtUpTitle')}</Text>
          <Text style={styles.centerText}>{t('flashcards.caughtUpBody')}</Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  const toggleFavorite = (id: string) => {
    setFavorited((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        variant="purple"
        title={t('flashcards.header')}
        onBack={closeDeck}
        right={
          <IconButton variant="plain" onPress={next} accessibilityLabel={t('flashcards.nextCard')}>
            <RotateCcw size={18} color="#FFFFFF" />
          </IconButton>
        }
      />

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <View style={styles.reviewToggleRow}>
          <Pressable
            style={[styles.reviewToggleBtn, !showLearned && styles.reviewToggleBtnActive]}
            onPress={() => {
              setShowLearned(false);
              setIndex(0);
              setFlipped(false);
            }}
          >
            <Text style={[styles.reviewToggleText, !showLearned && styles.reviewToggleTextActive]}>
              {t('flashcards.toReview')}
            </Text>
            <View style={[styles.countBadge, !showLearned && styles.countBadgeActive]}>
              <Text style={[styles.countBadgeText, !showLearned && styles.countBadgeTextActive]}>{dueCount}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.reviewToggleBtn, showLearned && styles.reviewToggleBtnActive]}
            onPress={() => {
              setShowLearned(true);
              setIndex(0);
              setFlipped(false);
            }}
          >
            <Text style={[styles.reviewToggleText, showLearned && styles.reviewToggleTextActive]}>
              {t('flashcards.learned')}
            </Text>
          </Pressable>
        </View>

        {card.last_rating === 'easy' && !card.verified_live && (
          <View style={styles.pendingBadge}>
            <RefreshCw size={12} color={colors.warning} />
            <Text style={styles.pendingBadgeText}>{t('flashcards.pendingRecheck')}</Text>
          </View>
        )}

        <View style={styles.cardArea}>
          <Pressable onPress={() => setFlipped((f) => !f)} style={styles.cardPressable} accessibilityLabel={t('flashcards.tapToFlip')}>
            <Animated.View style={[styles.card, styles.cardFront, { transform: [{ perspective: 1000 }, { rotateY: frontRotate }] }]}>
              <View style={styles.cardTopRow}>
                <View style={styles.cardEyebrow}>
                  <Text style={styles.cardEyebrowText}>{t('flashcards.rememberPhrase')}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => toggleFavorite(card.id)}>
                  <Star size={20} color={colors.textFaint} fill={favorited.has(card.id) ? colors.gold : 'none'} />
                </Pressable>
              </View>
              <Text style={styles.cardEnglish}>{card.en}</Text>
              <Pressable
                style={[styles.speakerBtn, listening && styles.speakerBtnActive]}
                onPress={listen}
                accessibilityLabel={t('flashcards.listen')}
              >
                <Volume2 size={20} color={listening ? colors.textOnPrimary : colors.primary} />
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.card, styles.cardBack, { transform: [{ perspective: 1000 }, { rotateY: backRotate }] }]}>
              <Text style={styles.cardLabel}>{t('flashcards.back')}</Text>
              <Text style={styles.cardEnglish}>{card.en}</Text>
              <Text style={styles.cardPt}>{card.pt}</Text>
              <Text style={styles.cardExplanation}>{card.explanation}</Text>
              {card.subject || card.verb || card.complement ? (
                <View style={styles.structureBoxOnDark}>
                  {card.subject ? (
                    <View style={styles.structureRow}>
                      <Text style={[styles.structureTag, styles.structureTagOnDark]}>S</Text>
                      <Text style={styles.structureValueOnDark}>{card.subject}</Text>
                    </View>
                  ) : null}
                  {card.verb ? (
                    <View style={styles.structureRow}>
                      <Text style={[styles.structureTag, styles.structureTagOnDark]}>V</Text>
                      <Text style={styles.structureValueOnDark}>{card.verb}</Text>
                    </View>
                  ) : null}
                  {card.complement ? (
                    <View style={styles.structureRow}>
                      <Text style={[styles.structureTag, styles.structureTagOnDark]}>C</Text>
                      <Text style={styles.structureValueOnDark}>{card.complement}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.flipHint}>{t('flashcards.tapToFlipBack')}</Text>
            </Animated.View>
          </Pressable>
        </View>

        <RetentionGraph card={card} />
        <RatingButtons card={card} onRated={next} />
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
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerTitle: {
    ...typography.section,
    marginTop: spacing.sm,
    color: colors.text,
  },
  centerText: {
    ...typography.body,
    marginTop: 4,
    color: colors.textMuted,
    textAlign: 'center',
  },
  deckList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  deckCard: {
    marginBottom: spacing.sm,
  },
  deckIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  deckName: {
    ...typography.section,
    color: colors.text,
  },
  deckMeta: {
    ...typography.caption,
    marginTop: 2,
    color: colors.textMuted,
  },
  deckProgress: {
    marginTop: 6,
    marginRight: spacing.sm,
  },
  deckTip: {
    ...typography.caption,
    marginTop: spacing.md,
    color: colors.textFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  cardArea: {
    height: 230,
    marginBottom: spacing.lg,
  },
  cardPressable: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    ...shadows.card,
  },
  cardFront: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBack: {
    backgroundColor: colors.primary,
  },
  cardTopRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    backgroundColor: colors.rating.hardSoft,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  cardEyebrowText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.rating.hard,
  },
  cardLabel: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textFaint,
  },
  cardEnglish: {
    ...typography.display,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
  },
  cardPt: {
    marginTop: spacing.sm,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  cardExplanation: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  speakerBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    marginTop: spacing.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerBtnActive: {
    backgroundColor: colors.primary,
  },
  structureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  structureTag: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    marginRight: 8,
  },
  structureBoxOnDark: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  structureTagOnDark: {
    backgroundColor: colors.textOnPrimary,
    color: colors.primary,
  },
  structureValueOnDark: {
    fontSize: 14,
    color: colors.textOnPrimary,
  },
  reviewToggleRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    padding: 4,
  },
  reviewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.round,
  },
  reviewToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  reviewToggleText: {
    ...typography.label,
    color: colors.textMuted,
  },
  reviewToggleTextActive: {
    color: colors.textOnPrimary,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
  },
  countBadgeTextActive: {
    color: colors.textOnPrimary,
  },
  retentionSection: {
    marginBottom: spacing.lg,
  },
  retentionLabel: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  yAxis: {
    height: 70,
    justifyContent: 'space-between',
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axisText: {
    fontSize: 9,
    color: colors.textFaint,
  },
  nextReviewBadge: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  nextReviewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  nextReviewDate: {
    ...typography.label,
    marginTop: spacing.xs,
    fontWeight: '800',
    color: colors.primary,
  },
  nextReviewIn: {
    marginTop: 1,
    fontSize: 10,
    color: colors.textMuted,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    marginBottom: spacing.sm,
    backgroundColor: colors.warning + '22',
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A6D00',
  },
  flipHint: {
    position: 'absolute',
    bottom: spacing.md,
    fontSize: 12,
    color: colors.textFaint,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  ratingBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  ratingText: {
    ...typography.caption,
    fontWeight: '800',
    textAlign: 'center',
  },
});
