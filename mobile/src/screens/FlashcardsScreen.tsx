import { BookOpen, CheckCircle2, ChevronLeft, Layers, RotateCcw, Volume2, Loader2 } from 'lucide-react-native';

function CheckCircle2Icon() {
  return <CheckCircle2 size={32} color={colors.success} />;
}
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar } from '../components/AppTabBar';
import { ProgressBar } from '../components/ProgressBar';
import { useFlashcards, usePlanets, useReviewFlashcard } from '../api/hooks';
import { plural, useT, type TranslationKey } from '../i18n';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing } from '../theme';
import { speechPlayer } from '../voice/ttsPlayer';
import type { CardRating, Flashcard } from '../types';

const RATING_OPTIONS: { value: CardRating; labelKey: TranslationKey; color: string }[] = [
  { value: 'hard', labelKey: 'flashcards.ratingHard', color: colors.error },
  { value: 'medium', labelKey: 'flashcards.ratingMedium', color: colors.warning },
  { value: 'easy', labelKey: 'flashcards.ratingEasy', color: colors.success },
];

function RatingButtons({ card }: { card: Flashcard }) {
  const t = useT();
  const review = useReviewFlashcard();
  const [pending, setPending] = useState<CardRating | null>(null);

  const rate = (rating: CardRating) => {
    setPending(rating);
    review.mutate({ id: card.id, rating }, { onSettled: () => setPending(null) });
  };

  const current = pending ?? card.last_rating;
  return (
    <View style={styles.ratingRow}>
      {RATING_OPTIONS.map((opt) => {
        const selected = current === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => rate(opt.value)}
            disabled={review.isPending}
            style={[styles.ratingBtn, { borderColor: opt.color }, selected && { backgroundColor: opt.color }]}
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
  const insets = useSafeAreaInsets();
  const t = useT();
  const { activeDeckId, openDeck, closeDeck } = useUiStore();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [listening, setListening] = useState(false);

  const { data: cards = [], isLoading } = useFlashcards();
  const { data: planets = [] } = usePlanets();

  const deck = activeDeckId ?? 'all';
  // Study the due cards only (server SRS ordering: next_review_at asc).
  const deckCards = cards.filter((c) => (deck === 'all' || c.planet_id === deck) && c.due);
  const dueCount = deckCards.length;
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

  const listen = async () => {
    if (!card) return;
    setListening(true);
    await speechPlayer.speak(card.en);
    setListening(false);
  };

  if (activeDeckId === null) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerIcon}>
            <BookOpen size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>Flashcards</Text>
            <Text style={styles.headerSub}>Spaced repetition keeps it fresh</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.deckList} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.deckCard} onPress={() => openDeck('all')}>
            <View style={[styles.deckIcon, { backgroundColor: colors.primarySoft }]}>
              <Layers size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deckName}>All cards</Text>
              <Text style={styles.deckMeta}>{cards.length} cards · {cards.filter((c) => c.due).length} due now</Text>
              <View style={styles.deckProgress}>
                <ProgressBar
                  value={cards.length ? cards.filter((c) => c.due).length / cards.length : 0}
                  color={colors.primary}
                />
              </View>
            </View>
            <ChevronLeft size={20} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
          </Pressable>

          {planets.map((planet) => {
            const planetCards = cards.filter((c) => c.planet_id === planet.id);
            const planetDue = planetCards.filter((c) => c.due).length;
            return (
              <Pressable key={planet.id} style={styles.deckCard} onPress={() => openDeck(planet.id)}>
                <View style={[styles.deckIcon, { backgroundColor: `${planet.color}22` }]}>
                  <BookOpen size={22} color={planet.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deckName}>Planet {planet.number} · {planet.title}</Text>
                  <Text style={styles.deckMeta}>{planetCards.length} cards · {planetDue} due now</Text>
                  <View style={styles.deckProgress}>
                    <ProgressBar
                      value={planetCards.length ? planetDue / planetCards.length : 0}
                      color={planet.color}
                    />
                  </View>
                </View>
                <ChevronLeft size={20} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
              </Pressable>
            );
          })}

          <Text style={styles.deckTip}>
            Cards marked Hard come back sooner. Easy cards are tested again later to confirm you really know them.
          </Text>
        </ScrollView>

        <AppTabBar />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={closeDeck} hitSlop={8} style={styles.backBtn}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>{deck === 'all' ? 'All cards' : planetName(deck)}</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <Loader2 size={28} color={colors.textFaint} />
          <Text style={styles.centerText}>Loading your cards…</Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={closeDeck} hitSlop={8} style={styles.backBtn}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>{deck === 'all' ? 'All cards' : planetName(deck)}</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <BookOpen size={32} color={colors.primary} />
          <Text style={styles.centerTitle}>No cards here yet</Text>
          <Text style={styles.centerText}>
            Cards are created automatically from your corrections and lessons. Practice in Chat and they will appear here.
          </Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  if (!card) {
    // The deck has cards but nothing is due right now.
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={closeDeck} hitSlop={8} style={styles.backBtn}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.headerTitle}>{deck === 'all' ? 'All cards' : planetName(deck)}</Text>
          </View>
        </View>
        <View style={styles.centerState}>
          <CheckCircle2Icon />
          <Text style={styles.centerTitle}>All caught up!</Text>
          <Text style={styles.centerText}>
            Nothing is due right now. Keep chatting — new corrections become cards, and difficult cards come back sooner.
          </Text>
        </View>
        <AppTabBar />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={closeDeck} hitSlop={8} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle}>{deck === 'all' ? 'All cards' : planetName(deck)}</Text>
          <Text style={styles.headerSub}>
            Card {index + 1} of {deckCards.length} · {dueCount} due now
          </Text>
        </View>
        <Pressable onPress={next} hitSlop={8} style={styles.backBtn} accessibilityLabel="Next card">
          <RotateCcw size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.cardArea}>
        <Pressable onPress={() => setFlipped((f) => !f)} style={styles.cardPressable} accessibilityLabel="Flip card">
          <Animated.View style={[styles.card, styles.cardFront, { transform: [{ perspective: 1000 }, { rotateY: frontRotate }] }]}>
            <Text style={styles.cardLabel}>FRONT</Text>
            <Text style={styles.cardEnglish}>{card.en}</Text>
            <Pressable style={[styles.listenBtn, listening && { backgroundColor: colors.primary }]} onPress={listen}>
              <Volume2 size={16} color={listening ? colors.textOnPrimary : colors.primary} />
              <Text style={[styles.listenText, listening && { color: colors.textOnPrimary }]}>
                {listening ? 'Playing…' : 'Listen'}
              </Text>
            </Pressable>
            {card.subject || card.verb || card.complement ? (
              <View style={styles.structureBox}>
                {card.subject ? (
                  <View style={styles.structureRow}>
                    <Text style={styles.structureTag}>S</Text>
                    <Text style={styles.structureValue}>{card.subject}</Text>
                  </View>
                ) : null}
                {card.verb ? (
                  <View style={styles.structureRow}>
                    <Text style={styles.structureTag}>V</Text>
                    <Text style={styles.structureValue}>{card.verb}</Text>
                  </View>
                ) : null}
                {card.complement ? (
                  <View style={styles.structureRow}>
                    <Text style={styles.structureTag}>C</Text>
                    <Text style={styles.structureValue}>{card.complement}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.flipHint}>Tap to flip</Text>
          </Animated.View>

          <Animated.View style={[styles.card, styles.cardBack, { transform: [{ perspective: 1000 }, { rotateY: backRotate }] }]}>
            <Text style={styles.cardLabel}>BACK</Text>
            <Text style={styles.cardEnglish}>{card.en}</Text>
            <Text style={styles.cardPt}>{card.pt}</Text>
            <Text style={styles.cardExplanation}>{card.explanation}</Text>
            <Text style={styles.flipHint}>Tap to flip back</Text>
          </Animated.View>
        </Pressable>
      </View>

      <View style={[styles.ratingArea, { paddingBottom: spacing.sm }]}>
        <Text style={styles.ratingTitle}>How well did you know it?</Text>
        <RatingButtons card={card} />
        <Pressable onPress={next} style={styles.nextBtn}>
          <Text style={styles.nextText}>Next card</Text>
        </Pressable>
      </View>

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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerTitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  centerText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  deckList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  deckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  deckMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  deckProgress: {
    marginTop: 6,
    marginRight: spacing.sm,
  },
  deckTip: {
    marginTop: spacing.md,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
    fontSize: 26,
    fontWeight: '800',
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
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listenText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  structureBox: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
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
  structureValue: {
    fontSize: 14,
    color: colors.text,
  },
  flipHint: {
    position: 'absolute',
    bottom: spacing.md,
    fontSize: 12,
    color: colors.textFaint,
  },
  ratingArea: {
    paddingHorizontal: spacing.lg,
  },
  ratingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '800',
  },
  nextBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
});
