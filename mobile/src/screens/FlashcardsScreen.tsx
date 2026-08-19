import { BookOpen, CheckCircle2, ChevronRight, Layers, Loader2, RefreshCw, Star } from 'lucide-react-native';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTabBar } from '../components/AppTabBar';
import { ProgressBar } from '../components/ProgressBar';
import { Card, ScreenHeader } from '../components/ui';
import { StreakXpBar } from '../components/StreakXpBar';
import { usePlanet, useFlashcards, usePlanets, useReviewFlashcard } from '../api/hooks';
import { plural, useT, type TranslationKey } from '../i18n';
import { planetOrbSource } from '../planets/planetLevels';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { currentPlanet, type CardRating, type Flashcard } from '../types';

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

export function FlashcardsScreen() {
  const t = useT();
  const { activeDeckId, openDeck, closeDeck } = useUiStore();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [showLearned, setShowLearned] = useState(false);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());

  const { data: cards = [], isLoading } = useFlashcards();
  const { data: planets = [] } = usePlanets();
  // The module waiting on its cards, if any: its deck is the one thing
  // standing between the learner and the next module, so it comes first.
  const active = currentPlanet(planets);
  const { data: activeDetail } = usePlanet(active?.id);
  const pendingModule = activeDetail?.lessons?.find((l) => l.state === 'flashcards_pending');
  const moduleCards = pendingModule
    ? cards.filter((c) => c.lesson_id === pendingModule.id)
    : [];

  const deck = activeDeckId ?? 'all';
  // "Review" = due cards (server SRS ordering: next_review_at asc).
  // "Learned" = cards not currently due, i.e. already reviewed ahead.
  // A deck is "all", a planet, or the pending module's own set.
  const inDeck = (c: (typeof cards)[number]) =>
    deck === 'all' || c.planet_id === deck || c.lesson_id === deck;
  const dueTotal = cards.filter((c) => c.due).length;
  const dueCount = cards.filter((c) => inDeck(c) && c.due).length;
  const learnedCount = cards.filter((c) => inDeck(c) && !c.due).length;
  // Opening a deck with nothing due must never be a dead end: default to the
  // Learned tab so the learner can still browse what they've studied instead
  // of staring at a "caught up" screen with nowhere to go.
  const showLearnedActive = showLearned || dueCount === 0;
  const deckCards = cards.filter((c) => inDeck(c) && (showLearnedActive ? !c.due : c.due));
  const planetName = (id: string | null) => {
    if (!id) return t('flashcards.allCards');
    const asPlanet = planets.find((p) => p.id === id);
    if (asPlanet) return asPlanet.title;
    // A module's review deck (opened via "Start review") is titled by the
    // module itself, not the generic planet fallback.
    const asModule = activeDetail?.lessons?.find((l) => l.id === id);
    return asModule?.title ?? t('flashcards.planetFallback');
  };

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
    // A card rated in the due deck stops being due, so the refetch drops it
    // and the current index already lands on the card that followed it —
    // advancing as well skipped that card entirely. The Learned deck keeps
    // its cards, so there it still has to move on.
    if (showLearnedActive) {
      setIndex((i) => (i + 1) % Math.max(deckCards.length, 1));
    }
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
          {pendingModule && moduleCards.length > 0 && (
            <Card row style={styles.gateCard} onPress={() => openDeck(pendingModule.id)}>
              <View style={styles.gateIcon}>
                <Layers size={20} color={colors.brand.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>{pendingModule.title}</Text>
                <Text style={styles.gateBody}>
                  {t('flashcards.moduleGate', {
                    done: pendingModule.flashcards_reviewed,
                    total: pendingModule.flashcards_total,
                  })}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.brand.orange} />
            </Card>
          )}

          <Card row style={styles.heroCard} onPress={() => openDeck('all')}>
            <View style={styles.heroIcon}>
              <Layers size={22} color={colors.textOnPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>{t('flashcards.allCards')}</Text>
              <Text style={styles.heroMeta}>
                {t(plural(cards.length, 'flashcards.cardOne', 'flashcards.cardOther'), { count: cards.length })} ·{' '}
                {t('flashcards.dueNow', { count: dueTotal })}
              </Text>
              <View style={styles.heroProgress}>
                {/* Share already reviewed — a full bar means "nothing left today". */}
                <ProgressBar
                  value={cards.length ? (cards.length - dueTotal) / cards.length : 0}
                  color={colors.textOnPrimary}
                  trackColor="rgba(255,255,255,0.25)"
                  height={6}
                />
              </View>
            </View>
            {dueTotal > 0 ? (
              <View style={styles.studyBtn}>
                <Text style={styles.studyBtnText}>{t('flashcards.studyNow')}</Text>
                <ChevronRight size={16} color={colors.primary} />
              </View>
            ) : (
              <View style={styles.caughtUpBtn}>
                <CheckCircle2 size={14} color={colors.textOnPrimary} />
                <Text style={styles.caughtUpBtnText}>{t('flashcards.caughtUpTitle')}</Text>
              </View>
            )}
          </Card>

          {planets.map((planet) => {
            const planetCards = cards.filter((c) => c.planet_id === planet.id);
            const planetDue = planetCards.filter((c) => c.due).length;
            const orb = planetOrbSource(planet.number);
            return (
              <Card row key={planet.id} style={styles.deckCard} onPress={() => openDeck(planet.id)}>
                {/* The planet's own art, cut out of the same level images the
                    Planets screen shows, bleeding in from the right. */}
                {orb ? <Image source={orb} style={styles.deckPlanet} /> : null}
                <View style={[styles.deckIcon, { backgroundColor: `${planet.color}22` }]}>
                  <BookOpen size={22} color={planet.color} />
                </View>
                <View style={styles.deckBody}>
                  <Text style={styles.deckName}>
                    {t('flashcards.planetDeck', { number: planet.number, title: planet.title })}
                  </Text>
                  <Text style={[styles.deckMeta, !planetCards.length && styles.deckMetaEmpty]}>
                    {t(plural(planetCards.length, 'flashcards.cardOne', 'flashcards.cardOther'), {
                      count: planetCards.length,
                    })}{' '}
                    · {t('flashcards.dueNow', { count: planetDue })}
                  </Text>
                  <View style={styles.deckProgress}>
                    <ProgressBar
                      value={planetCards.length ? (planetCards.length - planetDue) / planetCards.length : 0}
                      color={planet.color}
                      height={6}
                    />
                  </View>
                </View>
                {planetDue > 0 && (
                  <View style={[styles.duePill, { backgroundColor: planet.color }]}>
                    <Text style={styles.duePillText}>{planetDue}</Text>
                  </View>
                )}
                <ChevronRight size={20} color={colors.textFaint} />
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
        <ScreenHeader
          title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)}
          onBack={closeDeck}
          right={<StreakXpBar />}
        />
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
        <ScreenHeader
          title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)}
          onBack={closeDeck}
          right={<StreakXpBar />}
        />
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
    // The deck is truly empty — nothing to review AND nothing learned yet.
    // (A deck with cards but nothing due never gets here: it opens on the
    // Learned tab via showLearnedActive.)
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)}
          onBack={closeDeck}
          right={<StreakXpBar />}
        />
        <View style={styles.centerState}>
          <BookOpen size={32} color={colors.primary} />
          <Text style={styles.centerTitle}>{t('flashcards.emptyTitle')}</Text>
          <Text style={styles.centerText}>{t('flashcards.emptyBody')}</Text>
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
      {/* Where XP is actually earned — each rating grants XP server-side and
          refetches the stats, so the synced pill (fill + floating badge) lives
          right here. (The old next-card skip button was dropped: the rating
          buttons already advance the card, and a two-item right side squeezed
          the centered title on small phones — the brief forbids that.) */}
      <ScreenHeader
        variant="purple"
        title={t('flashcards.header')}
        onBack={closeDeck}
        right={<StreakXpBar dark />}
      />

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <View style={styles.reviewToggleRow}>
          <Pressable
            disabled={dueCount === 0}
            style={[styles.reviewToggleBtn, !showLearnedActive && styles.reviewToggleBtnActive]}
            onPress={() => {
              setShowLearned(false);
              setIndex(0);
              setFlipped(false);
            }}
          >
            <Text style={[styles.reviewToggleText, !showLearnedActive && styles.reviewToggleTextActive]}>
              {t('flashcards.toReview')}
            </Text>
            <View style={[styles.countBadge, !showLearnedActive && styles.countBadgeActive]}>
              <Text style={[styles.countBadgeText, !showLearnedActive && styles.countBadgeTextActive]}>{dueCount}</Text>
            </View>
          </Pressable>
          <Pressable
            disabled={learnedCount === 0}
            style={[styles.reviewToggleBtn, showLearnedActive && styles.reviewToggleBtnActive]}
            onPress={() => {
              setShowLearned(true);
              setIndex(0);
              setFlipped(false);
            }}
          >
            <Text style={[styles.reviewToggleText, showLearnedActive && styles.reviewToggleTextActive]}>
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
                <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); toggleFavorite(card.id); }}>
                  <Star size={20} color={colors.textFaint} fill={favorited.has(card.id) ? colors.gold : 'none'} />
                </Pressable>
              </View>
              {/* The front shows ONLY the English sentence — the translation
                  stays hidden until "Reveal Translation" (spec: try to recall
                  first). numberOfLines caps a long phrase at the card's
                  minimum height on short screens. */}
              <Text style={styles.cardEnglish} numberOfLines={2}>
                {card.en}
              </Text>
              <Pressable
                style={styles.revealBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  setFlipped(true);
                }}
                accessibilityLabel={t('flashcards.revealTranslation')}
              >
                <Text style={styles.revealBtnText}>{t('flashcards.revealTranslation')}</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.card, styles.cardBack, { transform: [{ perspective: 1000 }, { rotateY: backRotate }] }]}>
              <Text style={styles.cardPt}>{card.pt}</Text>
              <Pressable
                style={styles.backActionBtn}
                onPress={() => setFlipped(false)}
                accessibilityLabel={t('flashcards.tapToFlipBack')}
              >
                <Text style={styles.backActionText}>{t('flashcards.hideTranslation')}</Text>
              </Pressable>
            </Animated.View>
          </Pressable>
        </View>

        <View style={styles.ratingSlot}>
          {flipped && <RatingButtons card={card} onRated={next} />}
        </View>
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
    // flexGrow lets the card claim the leftover height instead of leaving a
    // blank block above the tab bar.
    flexGrow: 1,
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
    // Clears the floating tab bar — the last deck was landing underneath it.
    paddingBottom: 120,
    paddingTop: spacing.sm,
  },
  gateCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.brand.orange,
  },
  gateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFEEDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: {
    ...typography.cardTitle,
    color: colors.text,
  },
  gateBody: {
    ...typography.caption,
    color: colors.brand.orange,
    marginTop: 2,
  },
  heroCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primary,
    borderColor: 'transparent',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  heroName: {
    ...typography.section,
    color: colors.textOnPrimary,
  },
  heroMeta: {
    ...typography.caption,
    marginTop: 2,
    color: 'rgba(255,255,255,0.85)',
  },
  heroProgress: {
    marginTop: 8,
    marginRight: spacing.sm,
  },
  studyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.textOnPrimary,
    borderRadius: radius.round,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  studyBtnText: {
    ...typography.label,
    color: colors.primary,
  },
  // Shown on the hero card instead of "Study now" when every card is caught
  // up — a status, not an action, so the learner isn't lured into a deck
  // with nothing to review.
  caughtUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  caughtUpBtnText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  deckCard: {
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  duePill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  deckIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  deckPlanet: {
    position: 'absolute',
    right: 4,
    // Taller than the row, so it bleeds past the card's top and bottom.
    top: -14,
    width: 104,
    height: 104,
    // A watermark, not a subject: the row's text has to stay the loudest
    // thing in it.
    opacity: 0.3,
  },
  deckBody: {
    flex: 1,
    // Long titles wrap before they reach the planet.
    paddingRight: 56,
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
  deckMetaEmpty: {
    color: colors.textFaint,
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
    // Fills whatever the toggle row and the rating slot leave over, so the
    // screen has no dead space; minHeight keeps it readable on short phones,
    // where the sheet scrolls instead.
    flex: 1,
    minHeight: 240,
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
  cardEnglish: {
    ...typography.display,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
  },
  // "Reveal Translation" — the card front's only action.
  revealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingHorizontal: 22,
    paddingVertical: 12,
    minWidth: 190,
  },
  revealBtnText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  backActionBtn: {
    position: 'absolute',
    bottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.round,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  backActionText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textOnPrimary,
  },
  cardPt: {
    ...typography.display,
    fontSize: 24,
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  // ---- Hint bottom sheet ----
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
  ratingSlot: {
    minHeight: 45,
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
