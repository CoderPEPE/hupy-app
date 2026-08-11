import {
  CheckCircle2,
  ChevronLeft,
  ListChecks,
  Loader2,
  LogOut,
  Mic,
  Sparkles,
  Volume2,
  Square,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar } from '../components/AppTabBar';
import { LanguageSwitch } from '../components/LanguageSwitch';
import {
  useAddCorrection,
  useAddMessage,
  useBumpProgress,
  useConversation,
  useConversations,
  useCorrectionToCard,
  useCreateConversation,
  useLesson,
  usePlanets,
} from '../api/hooks';
import { localeTag, plural, useI18nStore, useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { colors, radius, shadows, spacing } from '../theme';
import { useVoiceConversation } from '../voice/useVoiceConversation';
import { speechPlayer } from '../voice/ttsPlayer';
import type { ChatMessage, ConversationSummary, LessonCorrection, LessonStep } from '../types';

type Mode = 'demo' | 'live';

function stepToTutorMessage(step: LessonStep, index: number): ChatMessage {
  return {
    id: `lesson-${step.id ?? index}`,
    role: 'tutor',
    kind: step.kind,
    text: step.tutor,
    time: '',
    correction: step.correction ?? undefined,
  };
}

function CorrectionCard({
  correction,
  compact,
}: {
  correction: LessonCorrection & { id?: string };
  compact?: boolean;
}) {
  const t = useT();
  const makeCard = useCorrectionToCard();
  const [converted, setConverted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const play = async () => {
    setPlaying(true);
    await speechPlayer.speak(correction.corrected);
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const t = useT();
  const isUser = message.role === 'user';
  const kindLabel =
    message.kind === 'teach'
      ? t('chat.kind.teach')
      : message.kind === 'repeat'
        ? t('chat.kind.repeat')
        : message.kind === 'question'
          ? t('chat.kind.question')
          : message.kind === 'praise'
            ? t('chat.kind.praise')
            : message.kind === 'review'
              ? t('chat.kind.review')
              : t('chat.kind.correction');

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowTutor]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleTutor]}>
        {!isUser && message.kind && (
          <View style={styles.bubbleKindRow}>
            <Sparkles size={11} color={colors.primary} />
            <Text style={styles.bubbleKind}>{kindLabel}</Text>
          </View>
        )}
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextTutor}>{message.text}</Text>
        {message.correction && <CorrectionCard correction={message.correction} />}
        {message.time !== '' && <Text style={styles.bubbleTime}>{message.time}</Text>}
      </View>
    </View>
  );
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { unlockNotice, clearUnlockNotice, setUnlockNotice, lessonPlanetId } = useUiStore();

  // Real voice engine (OpenAI Realtime) — fully functional.
  const voice = useVoiceConversation();

  const { data: planets = [] } = usePlanets();
  // The Planets tab can pick a planet via "Continue lesson"; otherwise the
  // first active (or first overall) planet drives the demo lesson.
  const planet =
    (lessonPlanetId ? planets.find((p) => p.id === lessonPlanetId) : undefined) ??
    planets.find((p) => p.status === 'active') ??
    planets[0] ??
    null;
  const lessonQuery = useLesson(planet?.id);
  const demoSteps = lessonQuery.data?.steps ?? [];

  const bumpProgress = useBumpProgress();
  const createConversation = useCreateConversation();
  const addMessage = useAddMessage();
  const addCorrection = useAddCorrection();

  const [mode, setMode] = useState<Mode>('demo');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [demoPlaying, setDemoPlaying] = useState(true);
  const pendingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  // Source of truth for the demo lesson position (state mirrors it for UI).
  const lessonIndexRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);

  // One backend conversation per session (demo or live) — created lazily.
  const conversationIdRef = useRef<string | null>(null);
  const persistedMessagesRef = useRef<Set<string>>(new Set());
  const prevStatusesRef = useRef<string[]>([]);

  const firstName = user?.email.split('@')[0] ?? t('chat.guestName');

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  /** Creates (once) and returns the backend conversation for this session. */
  const ensureConversation = async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!planet) return null;
    try {
      const conv = await createConversation.mutateAsync({
        title:
          mode === 'live'
            ? t('chat.history.liveConversationTitle')
            : t('chat.history.lessonTitle', { number: planet.number }),
        planetId: planet.id,
      });
      conversationIdRef.current = conv.id;
      return conv.id;
    } catch {
      return null; // offline: demo still works locally, nothing persisted
    }
  };

  /** Persists a tutor step (message + optional correction) to the conversation. */
  const persistTutorStep = async (step: LessonStep, index: number) => {
    const convId = await ensureConversation();
    if (!convId) return;
    try {
      await addMessage.mutateAsync({ conversationId: convId, role: 'assistant', text: step.tutor, kind: step.kind });
      if (step.correction) {
        const corr = await addCorrection.mutateAsync({
          conversationId: convId,
          said: step.correction.said,
          corrected: step.correction.corrected,
          explanation: step.correction.explanation,
          pt: step.correction.pt,
          mistakePart: step.correction.mistake_part,
          subject: step.correction.subject,
          verb: step.correction.verb,
          complement: step.correction.complement,
        });
        // Attach the persisted correction id so "Make a card" can use it.
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index && m.correction ? { ...m, correction: { ...m.correction, id: corr.id } } : m,
          ),
        );
      }
    } catch {
      // persistence is best-effort; the lesson keeps playing either way
    }
  };

  const persistUserMessage = async (text: string) => {
    const convId = await ensureConversation();
    if (!convId) return;
    try {
      await addMessage.mutateAsync({ conversationId: convId, role: 'user', text });
    } catch {
      // best-effort
    }
  };

  // Keep a mutable ref of the transcript so the interval can append reliably.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Demo mode: replay the DB lesson step by step (pausable) + persist.
  // Side effects run in the tick body, never inside a state updater, so
  // StrictMode double-invoking updaters cannot double-persist or double-bump.
  useEffect(() => {
    if (mode !== 'demo' || !demoPlaying || demoSteps.length === 0) return;
    const t = setInterval(() => {
      const i = lessonIndexRef.current;
      if (i >= demoSteps.length) {
        clearInterval(t);
        return;
      }
      const step = demoSteps[i];
      const msgIndex = messagesRef.current.length; // position in the transcript
      const tutorMsg = stepToTutorMessage(step, i);
      setMessages((prev) => [...prev, tutorMsg]);
      lessonIndexRef.current = i + 1;
      setLessonIndex(i + 1);

      persistTutorStep(step, msgIndex);
      if (step.mastery_gain && planet) {
        bumpProgress.mutate({ planetId: planet.id, metric: 'mastery', delta: step.mastery_gain });
      }
      if (step.expected) {
        const expected = step.expected;
        const to = setTimeout(() => {
          const now = new Date();
          const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
          const msg: ChatMessage = {
            id: `user-${i}-${Date.now()}`,
            role: 'user',
            text: expected,
            time,
          };
          setMessages((prev) => [...prev, msg]);
          persistUserMessage(expected);
        }, 2200);
        pendingTimeouts.current.push(to);
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, demoPlaying, demoSteps, planet]);

  // Auto-pause once the demo lesson has been fully replayed.
  useEffect(() => {
    if (mode === 'demo' && demoSteps.length > 0 && lessonIndex >= demoSteps.length) {
      setDemoPlaying(false);
    }
  }, [lessonIndex, mode, demoSteps]);

  // Clear any pending simulated replies on unmount.
  useEffect(() => {
    return () => {
      pendingTimeouts.current.forEach((to) => clearTimeout(to));
      speechPlayer.stop();
    };
  }, []);

  // Live mode: show the real transcript from the voice engine.
  useEffect(() => {
    if (mode === 'live' && voice.messages.length > 0) {
      setMessages(
        voice.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          time: '',
          partial: m.partial,
        })),
      );
    }
  }, [mode, voice.messages]);

  // Live mode: persist finalized voice messages to the conversation.
  useEffect(() => {
    if (mode !== 'live' || !conversationIdRef.current) return;
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
  }, [mode, voice.messages, addMessage]);

  // Surface an unlock banner when a locked planet becomes active.
  useEffect(() => {
    const statuses = planets.map((p) => p.status);
    const prev = prevStatusesRef.current;
    prevStatusesRef.current = statuses;
    if (prev.length === statuses.length) {
      statuses.forEach((s, i) => {
        if (prev[i] === 'locked' && s === 'active' && planets[i]) {
          setUnlockNotice(t('chat.unlockNotice', { number: planets[i].number }));
        }
      });
    }
  }, [planets, setUnlockNotice, t]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (mode === 'live') voice.stop();
    setMode(next);
    setMessages([]);
    messagesRef.current = [];
    setLessonIndex(0);
    lessonIndexRef.current = 0;
    setDemoPlaying(true);
    conversationIdRef.current = null;
    persistedMessagesRef.current = new Set();
    pendingTimeouts.current.forEach((to) => clearTimeout(to));
    pendingTimeouts.current = [];
  };

  const isLive = mode === 'live';
  const liveActive = isLive && voice.status !== 'idle' && voice.status !== 'error';
  const orbLabel = isLive
    ? voice.status === 'connecting'
      ? t('chat.orb.connecting')
      : voice.status === 'speaking'
        ? t('chat.orb.stop')
        : liveActive
          ? t('chat.orb.stop')
          : t('chat.orb.start')
    : demoPlaying
      ? t('chat.orb.stop')
      : t('chat.orb.play');

  const onOrbPress = async () => {
    if (mode === 'demo') {
      // Pause / resume the scripted lesson.
      pendingTimeouts.current.forEach((to) => clearTimeout(to));
      pendingTimeouts.current = [];
      setDemoPlaying((p) => !p);
      return;
    }
    if (voice.status === 'speaking') {
      voice.interrupt(); // barge-in: cut the tutor off
      return;
    }
    if (liveActive) {
      voice.stop();
      return;
    }
    // Every live session gets its own fresh conversation, then go live.
    conversationIdRef.current = null;
    persistedMessagesRef.current = new Set();
    await ensureConversation();
    voice.start();
  };

  const liveHint = isLive
    ? voice.status === 'connecting'
      ? t('chat.hint.connecting')
      : voice.status === 'speaking'
        ? t('chat.hint.tutorSpeaking')
        : liveActive
          ? t('chat.hint.micLive')
          : t('chat.hint.tapToStart')
    : demoPlaying
      ? t('chat.hint.demoPause')
      : t('chat.hint.demoResume');

  const lessonLoaded = mode === 'demo' && demoSteps.length === 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerGreeting}>{t('chat.greeting', { name: firstName })}</Text>
          <View style={styles.planetPill}>
            <View style={[styles.planetDot, { backgroundColor: planet?.color ?? colors.primary }]} />
            <Text style={styles.planetPillText}>
              {planet
                ? t('chat.planetPill', { number: planet.number, title: planet.title })
                : t('chat.loadingPlanets')}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <LanguageSwitch />
          <Pressable
            style={styles.headerIconBtn}
            onPress={signOut}
            accessibilityLabel={t('chat.logOut')}
            hitSlop={8}
          >
            <LogOut size={18} color={colors.textMuted} />
          </Pressable>
          <View style={styles.modeSwitch}>
            <Pressable
              style={[styles.modeBtn, mode === 'demo' && styles.modeBtnActive]}
              onPress={() => switchMode('demo')}
            >
              <Text style={[styles.modeText, mode === 'demo' && styles.modeTextActive]}>{t('chat.modeDemo')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, mode === 'live' && styles.modeBtnActive]}
              onPress={() => switchMode('live')}
            >
              <Mic size={13} color={mode === 'live' ? colors.textOnPrimary : colors.textMuted} />
              <Text style={[styles.modeText, mode === 'live' && styles.modeTextActive]}>{t('chat.modeLive')}</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.headerIconBtn, showHistory && styles.headerIconBtnActive]}
            onPress={() => setShowHistory((s) => !s)}
            accessibilityLabel={t('chat.history')}
          >
            <ListChecks size={20} color={showHistory ? colors.textOnPrimary : colors.textMuted} />
          </Pressable>
        </View>
      </View>

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
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.transcript}
            contentContainerStyle={styles.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sessionBanner}>
              <Sparkles size={14} color={colors.primary} />
              <Text style={styles.sessionBannerText}>
                {isLive ? t('chat.sessionLive') : t('chat.sessionDemo')}
              </Text>
            </View>
            {lessonLoaded && !lessonQuery.isError && (
              <View style={styles.loadingRow}>
                <Loader2 size={16} color={colors.textFaint} />
                <Text style={styles.loadingText}>{t('chat.preparingLesson')}</Text>
              </View>
            )}
            {mode === 'demo' && lessonQuery.isError && (
              <Pressable style={styles.errorBanner} onPress={() => lessonQuery.refetch()}>
                <Text style={styles.errorBannerText}>{t('chat.lessonError')}</Text>
              </Pressable>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLive ? (
              liveActive && (
                <View style={styles.listeningRow}>
                  <View style={styles.listeningDot} />
                  <Text style={styles.listeningText}>{t('chat.listening')}</Text>
                </View>
              )
            ) : (
              <View style={styles.listeningRow}>
                <View style={[styles.listeningDot, !demoPlaying && styles.listeningDotPaused]} />
                <Text style={styles.listeningText}>{demoPlaying ? t('chat.listening') : t('chat.paused')}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: spacing.sm }]}>
            <Animated.View
              style={[
                styles.orbRing,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.12] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
                },
              ]}
            />
            <Pressable
              style={[styles.orb, (isLive ? !liveActive : !demoPlaying) ? styles.orbIdle : styles.orbActive]}
              onPress={onOrbPress}
              accessibilityLabel={orbLabel}
            >
              {isLive && voice.status === 'speaking' ? (
                <Square size={22} color={colors.textOnPrimary} fill={colors.textOnPrimary} />
              ) : (
                <Text style={styles.orbLabel}>{orbLabel}</Text>
              )}
            </Pressable>
            <Text style={styles.orbHint}>{liveHint}</Text>
          </View>
        </>
      )}

      <AppTabBar />
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
      <View style={[styles.historyHeader, { paddingTop: topInset + spacing.sm }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.historyBack}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle}>{t('chat.history.title')}</Text>
          <Text style={styles.historySub}>{t('chat.history.subtitle')}</Text>
        </View>
      </View>
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
    <Pressable style={styles.convCard} onPress={onPress}>
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
    </Pressable>
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
  const { data: detail, isLoading } = useConversation(conversationId);
  const [playing, setPlaying] = useState<string | null>(null);

  const hear = async (text: string, id: string) => {
    setPlaying(id);
    await speechPlayer.speak(text);
    setPlaying(null);
  };

  return (
    <View style={styles.historyWrap}>
      <View style={[styles.historyHeader, { paddingTop: topInset + spacing.sm }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.historyBack}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle} numberOfLines={1}>
            {detail?.title ?? t('chat.history.defaultTitle')}
          </Text>
          <Text style={styles.historySub}>{t('chat.history.transcript')}</Text>
        </View>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
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
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.round,
    padding: 3,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.round,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.textOnPrimary,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
  sessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.round,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  sessionBannerText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: spacing.md,
  },
  loadingText: {
    marginLeft: 6,
    fontSize: 13,
    color: colors.textMuted,
  },
  errorBanner: {
    alignSelf: 'center',
    marginVertical: spacing.md,
    backgroundColor: '#FDECEC',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
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
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 8,
  },
  listeningDotPaused: {
    backgroundColor: colors.textFaint,
  },
  listeningText: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  orbRing: {
    position: 'absolute',
    top: spacing.sm - 6,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
  },
  orbActive: {
    backgroundColor: colors.primary,
  },
  orbIdle: {
    backgroundColor: colors.primaryPressed,
  },
  orbLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  orbHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textFaint,
  },
  historyWrap: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  historyBack: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  historySub: {
    fontSize: 13,
    color: colors.textMuted,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  convMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  historyCorrection: {
    marginTop: spacing.sm,
  },
});
