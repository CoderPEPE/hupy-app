import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Layers,
  Lightbulb,
  Loader2,
  Mic,
  RefreshCw,
  Star,
  Volume2,
} from 'lucide-react-native';

function CheckCircle2Icon() {
  return <CheckCircle2 size={32} color={colors.success} />;
}
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { AppTabBar } from '../components/AppTabBar';
import { ProgressBar } from '../components/ProgressBar';
import { Card, ScreenHeader } from '../components/ui';
import { StreakXpBar } from '../components/StreakXpBar';
import {
  useAddCorrection,
  useCreateConversation,
  useCreateFlashcard,
  usePlanet,
  useFlashcards,
  usePlanets,
  useReviewFlashcard,
} from '../api/hooks';
import { localeTag, plural, useI18nStore, useT, type TranslationKey } from '../i18n';
import { planetOrbSource } from '../planets/planetLevels';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { useVoiceConversation, type ToolCallHandler } from '../voice/useVoiceConversation';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
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
      <Text style={styles.nextReviewIn}>
        {t(plural(days, 'flashcards.nextReviewInOne', 'flashcards.nextReviewInOther'), { days })}
      </Text>
    </View>
  );
}

/**
 * Hint bottom sheet — the spec's "grammar analysis" panel. It only exists
 * here (never on the card itself): it splits the sentence into its parts
 * (subject / verb / complement) so the learner can rebuild it consciously.
 */
function HintSheet({ visible, card, onClose }: { visible: boolean; card: Flashcard; onClose: () => void }) {
  const t = useT();
  const parts = [
    { tag: 'S', label: t('flashcards.partSubject'), value: card.subject },
    { tag: 'V', label: t('flashcards.partVerb'), value: card.verb },
    { tag: 'C', label: t('flashcards.partComplement'), value: card.complement },
  ].filter((p) => p.value);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.hintSheet}>
        <View style={styles.hintSheetHandle} />
        <Text style={styles.hintSheetTitle}>{t('flashcards.hintTitle')}</Text>
        <Text style={styles.hintSheetSentence}>{card.en}</Text>
        {parts.length > 0 ? (
          <View style={styles.hintParts}>
            {parts.map((p) => (
              <View key={p.tag} style={styles.hintPartRow}>
                <View style={styles.hintPartTag}>
                  <Text style={styles.hintPartTagText}>{p.tag}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hintPartLabel}>{p.label}</Text>
                  <Text style={styles.hintPartValue}>{p.value}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hintEmpty}>{t('flashcards.hintEmpty')}</Text>
        )}
        {card.explanation ? (
          <View style={styles.hintExplanationBox}>
            <Text style={styles.hintExplanationLabel}>{t('flashcards.hintWhy')}</Text>
            <Text style={styles.hintExplanationText}>{card.explanation}</Text>
          </View>
        ) : null}
        <Pressable style={styles.hintDoneBtn} onPress={onClose}>
          <Text style={styles.hintDoneText}>{t('flashcards.hintDone')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Speaking practice — a live tutor session focused on repeating this exact
 * sentence. Reuses the same realtime voice pipeline as Chat, with an
 * instruction suffix that pins the target sentence so the tutor drills it.
 * Corrections made here are recorded and become cards (same as Chat).
 */
function PracticeModal({ card, onClose }: { card: Flashcard; onClose: () => void }) {
  const t = useT();
  const createConversation = useCreateConversation();
  const addCorrection = useAddCorrection();
  const createFlashcard = useCreateFlashcard();
  const conversationIdRef = useRef<string | null>(null);
  const planetIdRef = useRef<string | null>(card.planet_id);
  planetIdRef.current = card.planet_id;

  /** Creates (once) the conversation this practice session persists to. */
  const ensureConversation = async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    try {
      const conv = await createConversation.mutateAsync({
        title: t('flashcards.practiceTitle'),
        planetId: planetIdRef.current ?? undefined,
      });
      conversationIdRef.current = conv.id;
      return conv.id;
    } catch {
      return null; // offline: voice still works, nothing persisted
    }
  };

  const asString = (v: unknown) => (typeof v === 'string' ? v : '');
  const asOptional = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

  const onToolCall: ToolCallHandler = async (name, args) => {
    switch (name) {
      case 'record_correction': {
        const convId = await ensureConversation();
        if (!convId) return { error: 'no active conversation' };
        const corr = await addCorrection.mutateAsync({
          conversationId: convId,
          said: asString(args.said),
          corrected: asString(args.corrected),
          explanation: asString(args.explanation_pt),
          pt: asOptional(args.explanation_pt),
          mistakePart: asOptional(args.mistake_part),
          subject: asOptional(args.subject),
          verb: asOptional(args.verb),
          complement: asOptional(args.complement),
        });
        return { ok: true, correction_id: corr.id };
      }
      case 'create_flashcard': {
        const fc = await createFlashcard.mutateAsync({
          en: asString(args.en),
          pt: asString(args.pt),
          explanation: asOptional(args.explanation_pt),
          subject: asOptional(args.subject),
          verb: asOptional(args.verb),
          complement: asOptional(args.complement),
          planetId: planetIdRef.current ?? undefined,
        });
        return { ok: true, flashcard_id: fc.id };
      }
      default:
        return { error: `unknown tool ${name}` };
    }
  };

  const voice = useVoiceConversation(onToolCall, {
    instructionsSuffix: t('flashcards.practicePrompt', { sentence: card.en }),
  });

  // The sheet mounts only while open, so starting here is enough — unmount
  // (any close path) runs the hook's cleanup and stops the session.
  useEffect(() => {
    voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText =
    voice.status === 'connecting'
      ? t('chat.hint.connecting')
      : voice.status === 'speaking'
        ? t('chat.hint.tutorSpeaking')
        : voice.status === 'error'
          ? (voice.error ?? t('common.somethingWrong'))
          : t('flashcards.practiceListening');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.practiceBackdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.practiceSheet}>
        <View style={styles.practiceHeader}>
          <View style={styles.practiceHeaderIcon}>
            <Mic size={18} color={colors.textOnPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.practiceTitle}>{t('flashcards.practiceTitle')}</Text>
            <Text style={styles.practiceSubtitle}>{t('flashcards.practiceSubtitle')}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.close')}>
            <View style={styles.practiceClose}>
              <Text style={styles.practiceCloseText}>✕</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.practiceSentenceBox}>
          <Text style={styles.practiceSentence}>{card.en}</Text>
        </View>

        <View style={[styles.practiceStatusRow, voice.status === 'speaking' && styles.practiceStatusSpeaking]}>
          <View style={[styles.practiceStatusDot, voice.status === 'speaking' && styles.practiceStatusDotActive]} />
          <Text style={styles.practiceStatusText}>{statusText}</Text>
        </View>

        <View style={styles.practiceTranscript}>
          {voice.messages.length === 0 ? (
            <Text style={styles.practiceEmpty}>{t('flashcards.practiceEmpty')}</Text>
          ) : (
            voice.messages.map((m) => (
              <View key={m.id} style={[styles.practiceBubbleRow, m.role === 'user' ? styles.practiceBubbleUser : styles.practiceBubbleTutor]}>
                <Text style={m.role === 'user' ? styles.practiceBubbleUserText : styles.practiceBubbleTutorText}>
                  {m.text}
                </Text>
              </View>
            ))
          )}
        </View>

        <Pressable
          style={[styles.practiceStopBtn, (voice.status === 'idle' || voice.status === 'error') && styles.practiceStopBtnIdle]}
          onPress={onClose}
        >
          <Text style={styles.practiceStopText}>
            {voice.status === 'idle' || voice.status === 'error' ? t('flashcards.practiceDone') : t('flashcards.practiceStop')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function FlashcardsScreen() {
  const t = useT();
  const { activeDeckId, openDeck, closeDeck } = useUiStore();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [listening, setListening] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
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
  const deckCards = cards.filter((c) => inDeck(c) && (showLearned ? !c.due : c.due));
  const dueCount = cards.filter((c) => inDeck(c) && c.due).length;
  const dueTotal = cards.filter((c) => c.due).length;
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
            <View style={styles.studyBtn}>
              <Text style={styles.studyBtnText}>{t('flashcards.studyNow')}</Text>
              <ChevronRight size={16} color={colors.primary} />
            </View>
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
    // The deck has cards but nothing is due right now.
    return (
      <View style={styles.screen}>
        <ScreenHeader
          title={deck === 'all' ? t('flashcards.allCards') : planetName(deck)}
          onBack={closeDeck}
          right={<StreakXpBar />}
        />
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
                <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); toggleFavorite(card.id); }}>
                  <Star size={20} color={colors.textFaint} fill={favorited.has(card.id) ? colors.gold : 'none'} />
                </Pressable>
              </View>
              {/* The front shows ONLY the English sentence — the translation
                  stays hidden until "Reveal Translation" (spec: try to recall
                  first), and grammar analysis lives only inside the Hint
                  sheet. numberOfLines keeps the fixed-height card from
                  overflowing when the phrase wraps. */}
              <Text style={styles.cardEnglish} numberOfLines={2}>
                {card.en}
              </Text>
              <View style={styles.frontActions}>
                <Pressable
                  style={[styles.actionBtn, listening && styles.actionBtnActive]}
                  onPress={(e) => {
                    // These buttons live inside the card's flip Pressable;
                    // keep the tap from also flipping the card.
                    e.stopPropagation();
                    listen();
                  }}
                  accessibilityLabel={t('flashcards.listen')}
                >
                  <Volume2 size={20} color={listening ? colors.textOnPrimary : colors.primary} />
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    setPracticeOpen(true);
                  }}
                  accessibilityLabel={t('flashcards.speak')}
                >
                  <Mic size={20} color={colors.primary} />
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    setHintOpen(true);
                  }}
                  accessibilityLabel={t('flashcards.hint')}
                >
                  <Lightbulb size={20} color={colors.primary} />
                </Pressable>
              </View>
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
              <Text style={styles.cardLabel}>{t('flashcards.back')}</Text>
              <Text style={styles.cardEnglish}>{card.en}</Text>
              <Text style={styles.cardPt}>{card.pt}</Text>
              <Text style={styles.cardExplanation}>{card.explanation}</Text>
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

        <RetentionGraph card={card} />
        <RatingButtons card={card} onRated={next} />
      </ScrollView>

      <AppTabBar />
      <HintSheet visible={hintOpen} card={card} onClose={() => setHintOpen(false)} />
      {/* Mounted only while open: unmounting runs the voice hook's cleanup,
          which tears down the realtime session — so every close path (stop
          button, backdrop, ✕) leaves the mic and socket stopped. */}
      {practiceOpen && <PracticeModal card={card} onClose={() => setPracticeOpen(false)} />}
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
    height: 258,
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
  // Front-of-card actions: hear, speak, hint — the spec's four buttons with
  // "Reveal Translation" as the primary action below.
  frontActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: colors.primary,
  },
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
  // ---- Hint bottom sheet ----
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,28,0.45)',
  },
  hintSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  hintSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  hintSheetTitle: {
    ...typography.section,
    color: colors.text,
    textAlign: 'center',
  },
  hintSheetSentence: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  hintParts: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  hintPartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  hintPartTag: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  hintPartTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  hintPartLabel: {
    ...typography.eyebrow,
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  hintPartValue: {
    ...typography.body,
    color: colors.text,
    marginTop: 1,
  },
  hintEmpty: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  hintExplanationBox: {
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  hintExplanationLabel: {
    ...typography.eyebrow,
    fontSize: 9,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  hintExplanationText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    marginTop: 2,
  },
  hintDoneBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingVertical: 14,
    alignItems: 'center',
  },
  hintDoneText: {
    ...typography.label,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  // ---- Speaking practice sheet ----
  practiceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,28,0.45)',
  },
  practiceSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  practiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  practiceHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceTitle: {
    ...typography.section,
    fontSize: 16,
    color: colors.text,
  },
  practiceSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  practiceClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  practiceSentenceBox: {
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  practiceSentence: {
    ...typography.display,
    fontSize: 20,
    lineHeight: 27,
    color: colors.text,
    textAlign: 'center',
  },
  practiceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  practiceStatusSpeaking: {
    backgroundColor: colors.primarySoft,
  },
  practiceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  practiceStatusDotActive: {
    backgroundColor: colors.primary,
  },
  practiceStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  practiceTranscript: {
    marginTop: spacing.md,
    maxHeight: 150,
    gap: 6,
  },
  practiceEmpty: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  practiceBubbleRow: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    maxWidth: '92%',
  },
  practiceBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primarySoft,
    borderBottomRightRadius: 4,
  },
  practiceBubbleTutor: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  practiceBubbleUserText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  practiceBubbleTutorText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  practiceStopBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    paddingVertical: 14,
    alignItems: 'center',
  },
  practiceStopBtnIdle: {
    backgroundColor: colors.primaryPressed,
  },
  practiceStopText: {
    ...typography.label,
    fontWeight: '800',
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
