import {
  ArrowUp,
  AudioLines,
  CheckCircle2,
  ChevronLeft,
  Globe,
  ListChecks,
  Loader2,
  LogOut,
  Mic,
  Plus,
  Sparkles,
  Volume2,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar } from '../components/AppTabBar';
import { Confetti } from '../components/Confetti';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { PermissionModal } from '../components/PermissionModal';
import { StreakXpBar } from '../components/StreakXpBar';
import { VoiceGlobe } from '../components/VoiceGlobe';
import { Card, IconButton, ScreenHeader } from '../components/ui';
import { storage, StorageKeys } from '../storage';
import {
  useAddCorrection,
  useAddMessage,
  useBumpProgress,
  useConfirmFlashcardMastery,
  useConversation,
  useConversations,
  useCorrectionToCard,
  useCreateConversation,
  useCompleteModule,
  useCreateFlashcard,
  useGamificationStats,
  useMasterSentence,
  usePlanet,
  usePlanets,
} from '../api/hooks';
import type { ProgressMetric } from '../api/planets';
import type { RealtimeSessionMode } from '../api/realtime';
import { localeTag, plural, useI18nStore, useT, type TranslationKey } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { displayName } from '../utils/userName';
import { useVoiceConversation, type ToolCallHandler } from '../voice/useVoiceConversation';
import { effectiveVoice, speechPlayer } from '../voice/ttsPlayer';
import {
  type ChatMessage,
  type ConversationSummary,
  type LessonCorrection,
  type LessonStepKind,
} from '../types';

function CorrectionCard({
  correction,
  compact,
}: {
  correction: LessonCorrection & { id?: string };
  compact?: boolean;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const makeCard = useCorrectionToCard();
  const [converted, setConverted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const play = async () => {
    setPlaying(true);
    // Corrections are in the course's target language, so use the learner's
    // chosen tutor voice for it too.
    await speechPlayer.speak(correction.corrected, effectiveVoice(user?.voice ?? '', user?.language ?? 'en'));
    setPlaying(false);
  };

  const toCard = () => {
    if (!correction.id || makeCard.isPending) return;
    makeCard.mutate(correction.id, {
      onSuccess: () => setConverted(true),
    });
  };

  return (
    <View style={[styles.correction, compact && styles.correctionCompact]}>
      <View style={styles.correctionHeader}>
        <Sparkles size={14} color={colors.primary} />
        <Text style={styles.correctionTitle}>{t('chat.correction.title')}</Text>
      </View>

      <View style={styles.correctionRow}>
        <Text style={styles.correctionLabel}>{t('chat.correction.youSaid')}</Text>
        <Text style={styles.correctionSaid}>
          {correction.mistake_part
            ? correction.said.replace(correction.mistake_part, `«${correction.mistake_part}»`)
            : correction.said}
        </Text>
      </View>

      <View style={styles.correctionRow}>
        <Text style={styles.correctionLabelCorrect}>{t('chat.correction.correct')}</Text>
        <View style={styles.correctLine}>
          <CheckCircle2 size={15} color={colors.success} />
          <Text style={styles.correctionCorrect}>{correction.corrected}</Text>
        </View>
      </View>

      <Text style={styles.correctionExplanation}>{correction.explanation}</Text>

      <View style={styles.correctionActions}>
        <Pressable style={[styles.chip, playing && styles.chipPlaying]} onPress={play}>
          <Volume2 size={14} color={colors.primary} />
          <Text style={styles.chipText}>{playing ? t('chat.correction.playing') : t('chat.correction.hearIt')}</Text>
        </Pressable>
        {correction.id ? (
          <Pressable
            style={[styles.chip, converted && styles.chipDone]}
            onPress={toCard}
            disabled={converted || makeCard.isPending}
          >
            <CheckCircle2 size={14} color={converted ? colors.success : colors.primary} />
            <Text style={styles.chipText}>
              {converted
                ? t('chat.correction.addedToCards')
                : makeCard.isPending
                  ? t('chat.correction.adding')
                  : t('chat.correction.makeCard')}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.chip}>
            <CheckCircle2 size={14} color={colors.textFaint} />
            <Text style={styles.chipText}>{t('chat.correction.saving')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { unlockNotice, clearUnlockNotice, setUnlockNotice, lessonPlanetId } = useUiStore();

  const { data: planets = [] } = usePlanets();
  // Two modes, one screen ("clone this view"): the Chat tab with no lesson
  // context is a GENERIC free conversation — no planet pill, no curriculum
  // scope, like opening a new ChatGPT chat. A planet-scoped LESSON chat only
  // happens when a lesson was explicitly started ("Continue lesson" / chapter
  // intro), which sets `lessonPlanetId` in the ui store.
  const chatMode: RealtimeSessionMode = lessonPlanetId ? 'lesson' : 'generic';
  const planet = lessonPlanetId ? planets.find((p) => p.id === lessonPlanetId) ?? null : null;

  const createConversation = useCreateConversation();
  const addMessage = useAddMessage();
  const addCorrection = useAddCorrection();
  const createFlashcard = useCreateFlashcard();
  const completeModule = useCompleteModule();
  // The module the tutor is teaching this session — the one the whole prompt
  // is scoped to. Cards it mints and its completion both hang off this id.
  const { data: planetDetail } = usePlanet(lessonPlanetId ?? undefined);
  const currentModule = planetDetail?.lessons?.find(
    (l) => l.state === 'current' || l.state === 'flashcards_pending',
  );
  const masterSentence = useMasterSentence();
  const bumpProgress = useBumpProgress();
  const confirmFlashcardMastery = useConfirmFlashcardMastery();
  const { data: gamification } = useGamificationStats();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [showMicPrimer, setShowMicPrimer] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // One backend conversation per session — created once, on mount.
  const conversationIdRef = useRef<string | null>(null);
  const persistedMessagesRef = useRef<Set<string>>(new Set());
  const prevStatusesRef = useRef<string[]>([]);
  const prevBadgeCountRef = useRef<number | null>(null);
  const planetRef = useRef(planet);
  planetRef.current = planet;

  const firstName = displayName(user) || t('chat.guestName');
  /** The language being learned — what this whole session is *in*. */
  const targetLanguage = user?.language ?? 'en';

  /** Creates (once) and returns the backend conversation for this session.
   * Lesson chats are attached to their planet; the generic free conversation
   * is created without one. */
  const ensureConversation = async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const p = planetRef.current;
    try {
      const conv = await createConversation.mutateAsync({
        title:
          chatMode === 'generic'
            ? t('chat.history.freeChatTitle')
            : t('chat.history.liveConversationTitle'),
        planetId: p?.id,
      });
      conversationIdRef.current = conv.id;
      return conv.id;
    } catch {
      return null; // offline: voice still works, nothing persisted
    }
  };

  /**
   * The tutor's Realtime tool calls land here and are turned into real
   * writes — this is what makes corrections, flashcards, sentence mastery,
   * and progress genuinely earned during a live conversation instead of a
   * scripted replay.
   */
  const onToolCall: ToolCallHandler = async (name, args) => {
    const p = planetRef.current;
    switch (name) {
      case 'record_correction': {
        const convId = await ensureConversation();
        if (!convId) return { error: 'no active conversation' };
        const corr = await addCorrection.mutateAsync({
          conversationId: convId,
          said: asString(args.said),
          corrected: asString(args.corrected),
          explanation: asString(args.explanation_pt),
          pt: asOptionalString(args.explanation_pt),
          mistakePart: asOptionalString(args.mistake_part),
          subject: asOptionalString(args.subject),
          verb: asOptionalString(args.verb),
          complement: asOptionalString(args.complement),
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `correction-${corr.id}`,
            role: 'tutor',
            text: t('chat.correction.title'),
            time: '',
            kind: 'correction' as LessonStepKind,
            correction: {
              id: corr.id,
              said: corr.said,
              corrected: corr.corrected,
              explanation: corr.explanation,
              pt: corr.pt,
              mistake_part: corr.mistake_part,
              subject: corr.subject,
              verb: corr.verb,
              complement: corr.complement,
            },
          },
        ]);
        return { ok: true, correction_id: corr.id };
      }
      case 'create_flashcard': {
        const card = await createFlashcard.mutateAsync({
          en: asString(args.en),
          pt: asString(args.pt),
          explanation: asOptionalString(args.explanation_pt),
          subject: asOptionalString(args.subject),
          verb: asOptionalString(args.verb),
          complement: asOptionalString(args.complement),
          planetId: p?.id,
          // Cards belong to the module that produced them: reviewing them is
          // what opens the next one.
          lessonId: currentModule?.id,
        });
        return { ok: true, flashcard_id: card.id };
      }
      case 'complete_module': {
        if (!currentModule) return { error: 'no module in progress' };
        const weak = Array.isArray(args.weak_structures)
          ? args.weak_structures.filter((w): w is string => typeof w === 'string')
          : [];
        const result = await completeModule.mutateAsync({
          lessonId: currentModule.id,
          weakStructures: weak,
        });
        return {
          ok: true,
          flashcards_pending: !result.flashcards_done,
          flashcards_total: result.flashcards_total,
        };
      }
      case 'master_sentence': {
        const sentenceId = asOptionalString(args.sentence_id);
        if (!p || !sentenceId) return { error: 'missing planet or sentence_id' };
        await masterSentence.mutateAsync({ planetId: p.id, sentenceId, mastered: true });
        return { ok: true };
      }
      case 'bump_progress': {
        const metric = asOptionalString(args.metric) as ProgressMetric | undefined;
        const delta = typeof args.delta === 'number' ? args.delta : undefined;
        if (!p || !metric || delta === undefined) return { error: 'missing planet, metric, or delta' };
        await bumpProgress.mutateAsync({ planetId: p.id, metric, delta });
        return { ok: true };
      }
      case 'confirm_flashcard_mastery': {
        const flashcardId = asOptionalString(args.flashcard_id);
        if (!flashcardId) return { error: 'missing flashcard_id' };
        await confirmFlashcardMastery.mutateAsync(flashcardId);
        return { ok: true };
      }
      default:
        return { error: `unknown tool ${name}` };
    }
  };

  // Generic chat mints a free-conversation session; a lesson chat scopes the
  // tutor to its planet.
  const voice = useVoiceConversation(onToolCall, {
    mode: chatMode,
    planetId: lessonPlanetId ?? undefined,
  });

  // Merge the voice engine's transcript into the local message list without
  // clobbering tool-call-originated messages (corrections) appended above:
  // update existing entries in place, append genuinely new ones.
  useEffect(() => {
    if (voice.messages.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(voice.messages.map((m) => [m.id, m] as const));
      const next = prev.map((m) => {
        const vm = byId.get(m.id);
        return vm ? { ...m, text: vm.text, partial: vm.partial } : m;
      });
      const seen = new Set(next.map((m) => m.id));
      for (const vm of voice.messages) {
        if (!seen.has(vm.id)) {
          next.push({ id: vm.id, role: vm.role, text: vm.text, time: '', partial: vm.partial });
          seen.add(vm.id);
        }
      }
      return next;
    });
  }, [voice.messages]);

  // Persist finalized voice messages to the conversation.
  useEffect(() => {
    if (!conversationIdRef.current) return;
    voice.messages.forEach((m) => {
      if (m.partial || persistedMessagesRef.current.has(m.id)) return;
      if (!m.text.trim()) return; // nothing to persist yet — skip, don't burn the id
      persistedMessagesRef.current.add(m.id);
      addMessage.mutate({
        conversationId: conversationIdRef.current!,
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.messages, addMessage]);

  /** Opens the live session. Called from a deliberate user action — tapping
   * the globe or the composer mic, accepting the mic primer, or starting a
   * lesson from the planet path, which is a deliberate "teach me this
   * module" and so opens the session on arrival. */
  const startConversation = async () => {
    await ensureConversation();
    voice.start();
  };

  /** Starting a lesson lands here with the module already chosen: the learner
   * asked for the lesson, so the tutor opens it rather than leaving them on a
   * silent screen waiting for a tap. Runs once per lesson entry — the ref
   * keeps a re-render, or coming back to the tab, from restarting a session
   * that is already live. */
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lessonPlanetId || voice.status !== 'idle') return;
    if (autoStartedRef.current === lessonPlanetId) return;
    autoStartedRef.current = lessonPlanetId;
    // First ever session still explains why the microphone is needed.
    if (!storage.getBoolean(StorageKeys.micPrimerSeen)) {
      setShowMicPrimer(true);
      return;
    }
    startConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonPlanetId]);

  /** "+" in the composer: close the session and start a fresh conversation.
   * `openSession` clears the voice transcript on the next start, so the local
   * list can be emptied here without the old turns being merged back in. */
  const newConversation = () => {
    voice.stop();
    setMessages([]);
    persistedMessagesRef.current.clear();
    conversationIdRef.current = null;
  };

  const dismissMicPrimer = () => {
    storage.set(StorageKeys.micPrimerSeen, true);
    setShowMicPrimer(false);
  };

  /** Primer accepted → this was a deliberate "start", so begin listening. */
  const acceptMicPrimer = () => {
    dismissMicPrimer();
    startConversation();
  };

  // Surface an unlock banner (with a confetti burst) when a locked planet
  // becomes active — this only fires from real, server-computed mastery now.
  useEffect(() => {
    const statuses = planets.map((p) => p.status);
    const prev = prevStatusesRef.current;
    prevStatusesRef.current = statuses;
    if (prev.length === statuses.length) {
      statuses.forEach((s, i) => {
        if (prev[i] === 'locked' && s !== 'locked' && planets[i]) {
          setUnlockNotice(t('chat.unlockNotice', { number: planets[i].number }));
          setConfettiKey(Date.now());
        }
      });
    }
  }, [planets, setUnlockNotice, t]);

  // Celebrate a newly-earned badge the same way.
  useEffect(() => {
    if (!gamification) return;
    const count = gamification.badges.length;
    if (prevBadgeCountRef.current !== null && count > prevBadgeCountRef.current) {
      setConfettiKey(Date.now());
    }
    prevBadgeCountRef.current = count;
  }, [gamification]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);

  // Tear down on unmount so a background/backgrounded screen doesn't keep
  // streaming mic audio.
  useEffect(() => {
    return () => {
      voice.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 'connected' = a text-only session is open (started by a typed message):
  // the tutor answers out loud, but the mic is off. It's not "live" for mic
  // purposes, but the globe still treats it as an open session to stop.
  const liveActive =
    voice.status !== 'idle' && voice.status !== 'error' && voice.status !== 'connected';
  const globeActive = liveActive || voice.status === 'connected';
  // The globe is a plain start/stop toggle: tap to begin the session, tap
  // again (square) to end it — including ending a text-only session.
  const orbLabel = globeActive ? t('chat.orb.stop') : t('chat.orb.start');

  const onOrbPress = async () => {
    // A text-only session (mic off) is open — the globe closes it.
    if (voice.status === 'connected') {
      voice.stop();
      return;
    }
    // Live in any form (connecting, listening, tutor speaking) → stop.
    if (liveActive) {
      voice.stop();
      return;
    }
    // First ever start: explain why the mic is needed before requesting it.
    if (!storage.getBoolean(StorageKeys.micPrimerSeen)) {
      setShowMicPrimer(true);
      return;
    }
    await startConversation();
  };

  const liveHint =
    voice.status === 'connecting'
      ? t('chat.hint.connecting')
      : voice.status === 'connected'
        ? t('chat.hint.connected')
        : voice.status === 'speaking'
          ? t('chat.hint.tutorSpeaking')
          : liveActive
            ? t('chat.hint.micLive')
            : t('chat.hint.tapToStart');

  // --- Bottom composer: typed messages + one-tap voice ----------------------
  const canSendText = draft.trim().length > 0;

  /** Sends the typed draft to the tutor (answered out loud by the live
   * session) and persists it to the conversation history. */
  const sendDraft = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await ensureConversation();
    const sent = await voice.sendText(text);
    if (!sent) setDraft(text); // session failed — put it back so it's not lost
  };

  /** Bottom mic = "start talking". In a full voice session the mic is already
   * on, so the button is a passive live indicator (barging the tutor in if
   * she's mid-sentence). While a text-only session is open — or nothing is
   * running — it starts a full voice session, so one tap always means talk. */
  const onMicPress = async () => {
    if (liveActive && voice.micEnabled) {
      if (voice.status === 'speaking') voice.interrupt();
      return;
    }
    if (!storage.getBoolean(StorageKeys.micPrimerSeen)) {
      setShowMicPrimer(true);
      return;
    }
    await startConversation();
  };


  // One line of guidance above the transcript: a correction to read, the
  // tutor's turn to listen to, or the user's turn to talk.
  const lastMessage = messages[messages.length - 1];
  const stepPrompt = lastMessage?.correction
    ? t('chat.correctPrompt')
    : voice.status === 'listening'
      ? t('chat.speakPrompt')
      : t('chat.listenPrompt');

  // The last few messages, rendered as compact chat bubbles above the globe.
  const recentMessages = messages.slice(-10);
  // The tutor's latest real utterance — emphasized as the phrase to repeat.
  // Computed from the same slice the bubbles render, so the focus never
  // disagrees with what's on screen.
  const focusPhraseId =
    [...recentMessages].reverse().find((m) => m.role === 'tutor' && m.kind !== 'correction')?.id ?? null;
  const lastVisible = recentMessages[recentMessages.length - 1];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        left={
          <View style={styles.headerLeft}>
            <Text style={styles.headerGreeting}>{t('chat.greeting', { name: firstName })}</Text>
            <View style={styles.planetPill}>
              <View style={[styles.planetDot, { backgroundColor: planet?.color ?? colors.primary }]} />
              <Text style={styles.planetPillText}>
                {chatMode === 'generic'
                  ? t('chat.genericPill')
                  : planet
                    ? t('chat.planetPill', { number: planet.number, title: planet.title })
                    : t('chat.loadingPlanets')}
              </Text>
            </View>
          </View>
        }
        right={
          <>
            <StreakXpBar />
            <LanguageSwitch />
            <IconButton onPress={signOut} accessibilityLabel={t('chat.logOut')}>
              <LogOut size={18} color={colors.textMuted} />
            </IconButton>
            <IconButton
              onPress={() => setShowHistory((v) => !v)}
              accessibilityLabel={t('chat.history')}
              style={showHistory ? styles.headerIconBtnActive : undefined}
            >
              <ListChecks size={20} color={showHistory ? colors.textOnPrimary : colors.textMuted} />
            </IconButton>
          </>
        }
      />

      {unlockNotice && (
        <Pressable style={styles.unlockBanner} onPress={clearUnlockNotice}>
          <Sparkles size={14} color="#8A6D00" />
          <Text style={styles.unlockBannerText}>{unlockNotice}</Text>
        </Pressable>
      )}

      {showHistory ? (
        selectedConversation ? (
          <HistoryDetail
            conversationId={selectedConversation}
            onBack={() => setSelectedConversation(null)}
            topInset={insets.top}
          />
        ) : (
          <HistoryList
            onOpen={(id) => setSelectedConversation(id)}
            onBack={() => setShowHistory(false)}
            topInset={insets.top}
          />
        )
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={[
            styles.transcriptContent,
            // Nothing said yet → the orb owns the screen, centered.
            recentMessages.length === 0 && styles.transcriptEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* The prompt only appears once there's something to drill — an
              untouched screen is just the orb and its invitation. */}
          {recentMessages.length > 0 && <Text style={styles.stepPrompt}>{stepPrompt}</Text>}

          {recentMessages.length === 0 ? (
            <View style={styles.hero}>
              <VoiceGlobe active={globeActive} onPress={onOrbPress} accessibilityLabel={orbLabel} />
              <Text style={styles.heroTitle}>
                {t('chat.empty.title', { language: t(`chat.lang.${targetLanguage}` as TranslationKey) })}
              </Text>
              {/* Before the session opens this is the pitch; once it's live
                  the same line carries the connection state, so the promise of
                  speech is only made when the tutor can actually deliver it. */}
              <Text style={styles.heroSubtitle}>
                {globeActive ? liveHint : t('chat.empty.subtitle')}
              </Text>
              <Pressable onPress={onOrbPress} hitSlop={10} accessibilityRole="button">
                <Text style={styles.heroCta}>{globeActive ? t('chat.orb.stop') : t('chat.empty.start')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.chatBubbles}>
              {recentMessages.map((m, i) => {
                // Corrections render as the card below, not a plain bubble.
                if (m.kind === 'correction') return null;
                const isUser = m.role === 'user';
                // The tutor's latest real utterance is the phrase to repeat —
                // emphasized so the chat still reads as a drill.
                const isFocus = m.id === focusPhraseId;
                return (
                  <View
                    key={m.id}
                    style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowTutor]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isUser ? styles.bubbleUser : styles.bubbleTutor,
                        isFocus && styles.bubbleFocus,
                        m.partial && styles.bubblePartial,
                      ]}
                    >
                      <Text
                        style={[
                          isUser ? styles.bubbleTextUser : styles.bubbleTextTutor,
                          isFocus && styles.bubbleTextFocus,
                        ]}
                      >
                        {m.text}
                        {m.partial ? '…' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {lastVisible?.correction && <CorrectionCard correction={lastVisible.correction} />}

          {recentMessages.length > 0 && (
            <View style={styles.globeArea}>
              <VoiceGlobe active={globeActive} onPress={onOrbPress} accessibilityLabel={orbLabel} size={120} />
              <Text style={styles.orbHint}>{liveHint}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {!showHistory && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Which language this session is in — the mirror of the UI-locale
              switch in the header, for the language being learned. */}
          <View style={styles.targetLangRow}>
            <Globe size={14} color={colors.textMuted} />
            <Text style={styles.targetLangText}>{t(`language.${targetLanguage}` as TranslationKey)}</Text>
          </View>
          <View style={styles.composer}>
            <Pressable
              style={styles.composerPlus}
              onPress={newConversation}
              accessibilityRole="button"
              accessibilityLabel={t('chat.newConversation')}
            >
              <Plus size={20} color={colors.textMuted} />
            </Pressable>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={t('chat.input.placeholder')}
              placeholderTextColor={colors.textFaint}
              returnKeyType="send"
              onSubmitEditing={sendDraft}
              accessibilityLabel={t('chat.input.placeholder')}
            />
            {/* Typing takes over the trailing slot: with a draft it's "send",
                otherwise it's the pair from the design — bare mic to talk into
                the open session, and the orb button to start/stop one. */}
            {canSendText ? (
              <Pressable
                style={styles.composerSend}
                onPress={sendDraft}
                accessibilityRole="button"
                accessibilityLabel={t('chat.input.send')}
              >
                <ArrowUp size={20} color={colors.textOnPrimary} />
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={onMicPress}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.input.sendAudio')}
                >
                  <Mic size={22} color={liveActive ? colors.primary : colors.textMuted} />
                </Pressable>
                <Pressable
                  style={styles.composerSend}
                  onPress={onOrbPress}
                  accessibilityRole="button"
                  accessibilityLabel={orbLabel}
                >
                  <AudioLines size={20} color={colors.textOnPrimary} />
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      <AppTabBar />
      <Confetti burstKey={confettiKey} />
      <PermissionModal visible={showMicPrimer} onDismiss={dismissMicPrimer} onContinue={acceptMicPrimer} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// History: saved conversations
// ---------------------------------------------------------------------------

function HistoryList({
  onOpen,
  onBack,
  topInset,
}: {
  onOpen: (id: string) => void;
  onBack: () => void;
  topInset: number;
}) {
  const t = useT();
  const { data: conversations = [], isLoading } = useConversations();

  return (
    <View style={styles.historyWrap}>
      <ScreenHeader title={t('chat.history.title')} subtitle={t('chat.history.subtitle')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.historyContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.historyEmpty}>
            <Loader2 size={30} color={colors.textFaint} />
            <Text style={styles.historyEmptyBody}>{t('chat.history.loading')}</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.historyEmpty}>
            <CheckCircle2 size={36} color={colors.primary} />
            <Text style={styles.historyEmptyTitle}>{t('chat.history.empty')}</Text>
            <Text style={styles.historyEmptyBody}>{t('chat.history.emptyBody')}</Text>
          </View>
        ) : (
          conversations.map((c) => <ConversationRow key={c.id} conversation={c} onPress={() => onOpen(c.id)} />)
        )}
      </ScrollView>
    </View>
  );
}

function ConversationRow({ conversation, onPress }: { conversation: ConversationSummary; onPress: () => void }) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const date = new Date(conversation.updated_at).toLocaleDateString(localeTag(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Card row style={styles.convCard} onPress={onPress}>
      <View style={styles.convIcon}>
        <ListChecks size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.convTitle} numberOfLines={1}>
          {conversation.title}
        </Text>
        <Text style={styles.convMeta}>
          {t(plural(conversation.message_count, 'chat.history.messageCountOne', 'chat.history.messageCountOther'), {
            count: conversation.message_count,
          })}{' '}
          · {date}
        </Text>
      </View>
      <ChevronLeft size={20} color={colors.textFaint} style={{ transform: [{ rotate: '180deg' }] }} />
    </Card>
  );
}

function HistoryDetail({
  conversationId,
  onBack,
  topInset,
}: {
  conversationId: string;
  onBack: () => void;
  topInset: number;
}) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const { data: detail, isLoading } = useConversation(conversationId);
  const [playing, setPlaying] = useState<string | null>(null);

  const hear = async (text: string, id: string) => {
    setPlaying(id);
    await speechPlayer.speak(text, effectiveVoice(user?.voice ?? '', user?.language ?? 'en'));
    setPlaying(null);
  };

  return (
    <View style={styles.historyWrap}>
      <ScreenHeader
        title={detail?.title ?? t('chat.history.defaultTitle')}
        subtitle={t('chat.history.transcript')}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.historyContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.historyEmpty}>
            <Loader2 size={30} color={colors.textFaint} />
            <Text style={styles.historyEmptyBody}>{t('chat.history.detailLoading')}</Text>
          </View>
        ) : (
          <>
            {(detail?.messages ?? []).map((m) => {
              const isUser = m.role === 'user';
              return (
                <View key={m.id} style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowTutor]}>
                  <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleTutor]}>
                    <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextTutor}>{m.text}</Text>
                    <Text style={styles.bubbleTime}>
                      {new Date(m.created_at).toLocaleTimeString(localeTag(locale), {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              );
            })}
            {(detail?.corrections ?? []).map((c) => (
              <View key={c.id} style={styles.historyCorrection}>
                <CorrectionCard
                  compact
                  correction={{
                    id: c.id,
                    said: c.said,
                    corrected: c.corrected,
                    explanation: c.explanation,
                    pt: c.pt,
                    mistake_part: c.mistake_part,
                    subject: c.subject,
                    verb: c.verb,
                    complement: c.complement,
                  }}
                />
                <Pressable
                  style={[styles.chip, playing === c.id && styles.chipPlaying]}
                  onPress={() => hear(c.corrected, c.id)}
                >
                  <Volume2 size={14} color={colors.primary} />
                  <Text style={styles.chipText}>
                    {playing === c.id ? t('chat.correction.playing') : t('chat.correction.pronunciation')}
                  </Text>
                </Pressable>
              </View>
            ))}
            {(detail?.corrections ?? []).length === 0 && (detail?.messages ?? []).length === 0 && (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyBody}>{t('chat.history.noMessages')}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flex: 1,
  },
  headerGreeting: {
    ...typography.title,
    color: colors.text,
  },
  planetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  planetPillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  headerIconBtnActive: {
    backgroundColor: colors.primary,
  },
  unlockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: '#FFF7E0',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unlockBannerText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#8A6D00',
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  transcriptEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  stepPrompt: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chatBubbles: {
    gap: spacing.sm,
  },
  bubbleFocus: {
    backgroundColor: colors.primary,
  },
  bubbleTextFocus: {
    color: colors.textOnPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  bubblePartial: {
    opacity: 0.6,
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    ...typography.display,
    marginTop: spacing.xl,
    color: colors.brand.purpleDeep,
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  heroCta: {
    marginTop: spacing.xl,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },
  targetLangRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  targetLangText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  globeArea: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  bubbleRow: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowTutor: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    backgroundColor: colors.primarySoft,
    borderBottomRightRadius: 4,
  },
  bubbleTutor: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleKindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bubbleKind: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.primary,
  },
  bubbleTextUser: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
  },
  bubbleTextTutor: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
  },
  bubbleTime: {
    marginTop: 4,
    fontSize: 10,
    color: colors.textFaint,
    alignSelf: 'flex-end',
  },
  correction: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  correctionCompact: {
    marginBottom: spacing.sm,
  },
  correctionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  correctionTitle: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.primary,
  },
  correctionRow: {
    marginBottom: 4,
  },
  correctionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.error,
  },
  correctionLabelCorrect: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  correctionSaid: {
    fontSize: 15,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  correctLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  correctionCorrect: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  correctionExplanation: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  correctionActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipPlaying: {
    backgroundColor: colors.primary,
  },
  chipDone: {
    backgroundColor: colors.success,
  },
  chipText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  orbHint: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    // Total margins stay 16pt, but the bar sits ~15pt higher (closer to the
    // globe, with the breathing room moved below it, above the tab bar).
    marginTop: 0,
    marginBottom: 25,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.round,
    ...shadows.card,
  },
  composerPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyWrap: {
    flex: 1,
  },
  historyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  historyEmptyTitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  historyEmptyBody: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  convCard: {
    marginBottom: spacing.sm,
  },
  convIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  convTitle: {
    ...typography.cardTitle,
    fontWeight: '700',
    color: colors.text,
  },
  convMeta: {
    ...typography.caption,
    marginTop: 2,
    color: colors.textMuted,
  },
  historyCorrection: {
    marginTop: spacing.sm,
  },
});
