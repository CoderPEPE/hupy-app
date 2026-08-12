import {
  useAudioRecorder,
  type AudioDataEvent,
  type RecordingConfig,
} from '@siteed/audio-studio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { ApiError } from '../api/client';
import { getRealtimeClientSecret } from '../api/realtime';
import type { RealtimeTool } from '../api/realtime';
import { translate, useI18nStore } from '../i18n';
import { useAuthStore } from '../store/auth';
import { float32ToPcm16Base64, resample, rms } from './audioCodec';
import { audioLevels } from './audioLevels';
import { realtimeAudioPlayer } from './audioEngine';

export type ConversationStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export type ChatMessage = {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  partial?: boolean;
};

/** Invoked when the tutor calls a tool mid-conversation; must resolve with a
 * small JSON-serializable result the model can read back. */
export type ToolCallHandler = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1';
const RECORD_RATE = 48000; // supported by @siteed/audio-studio
const TARGET_RATE = 24000; // required by the Realtime API
/** Last-resort voice, only used if the backend response carries none. The real
 * voice is the learner's chosen tutor voice (or their course's default), sent
 * back by `/realtime/client-secret` — see `startSessionVoice` below. */
const FALLBACK_VOICE = 'coral';

/**
 * Safety margin added to the actual remaining playback time after the tutor
 * finishes a sentence (Android only — see the barge-in note on
 * `handleAudioStream` for why iOS doesn't need this): the speaker needs a
 * moment to go silent and the mic needs a moment to stop ringing.
 */
const POST_SPEECH_MUTE_MS = 400;

/**
 * iOS only: a brief mute right as a new tutor turn starts, so the mic doesn't
 * catch the exact instant playback begins. After this, the mic stays live
 * through the whole tutor turn so the user can interrupt by talking, relying
 * on the VoiceChat audio session's hardware echo cancellation (see
 * `RECORDING_CONFIG.ios.audioSession`) plus the echo gate below.
 */
const RESPONSE_START_GRACE_MS = 150;

/**
 * Mute window after the tutor's audio finishes, covering the tail still
 * coming out of the speaker. Android needs longer because it mutes the whole
 * turn anyway; iOS only needs to cover the playback tail.
 */
const POST_SPEECH_MUTE_IOS_MS = 150;

// ---------------------------------------------------------------------------
// Echo gate
//
// Hardware echo cancellation is not guaranteed: it is absent entirely in the
// iOS Simulator, and degrades on a real device at high speaker volume. Without
// it the tutor's own voice reaches the microphone, the server's VAD reports
// `input_audio_buffer.speech_started`, the tutor cuts itself off, answers the
// "interruption", and the whole thing loops.
//
// So while the tutor is speaking we require mic audio to be clearly louder
// than the echo we are currently observing before forwarding it. A real
// speaker sits far closer to the mic than the speaker bleed does, so genuine
// barge-in still gets through; steady speaker echo does not. Once the gate
// opens it stays open for the rest of the turn, so a real interruption is not
// chopped up mid-sentence.
// ---------------------------------------------------------------------------

/** Smoothing for the running estimate of the echo level (0..1, higher = faster). */
const ECHO_FLOOR_ALPHA = 0.15;
/** How much louder than the observed echo floor speech must be to count. */
const ECHO_GATE_MARGIN = 2.5;
/** Absolute floor, so near-silence can never open the gate. */
const ECHO_GATE_MIN_RMS = 0.02;
/** Consecutive qualifying frames (~100 ms each) required to open the gate. */
const ECHO_GATE_FRAMES = 2;

// Only used if the backend is too old to return the canonical instructions.
// Intentionally names no one: the backend personalizes the real prompt with
// the signed-in learner's own name, and this fallback has no way to know it.
const FALLBACK_TUTOR_PROMPT =
  'You are Huppy, a patient English tutor for a Brazilian Portuguese speaker. Teach before testing: ' +
  'present each sentence in English, explain in Portuguese, demonstrate pronunciation, ask for ' +
  'three repetitions, correct mistakes gently, and review previous content at unexpected moments. ' +
  'Keep replies short and encouraging. Do not assume the learner\'s name — ask if you need it.';

/**
 * Debug-only logger: the voice pipeline is chatty by design (it's how the
 * echo-loop was diagnosed), but that noise must not reach production logs.
 */
const debugLog = (...args: unknown[]) => {
  if (__DEV__) console.log(...args);
};

const RECORDING_CONFIG: RecordingConfig = {
  sampleRate: RECORD_RATE,
  channels: 1,
  encoding: 'pcm_16bit',
  streamFormat: 'float32',
  interval: 100,
  bufferDurationSeconds: 0.1,
  ios: {
    audioSession: {
      category: 'PlayAndRecord',
      mode: 'VoiceChat', // enables hardware echo cancellation while playing + recording
      categoryOptions: ['AllowBluetooth', 'DefaultToSpeaker'],
    },
  },
  android: {
    audioFocusStrategy: 'communication',
  },
};

/** Imperative i18n lookup: callbacks below are frozen in `useCallback([])`, so a
 * hook-bound `t` would go stale after a language switch — this always reads
 * the current locale instead. */
function t(key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) {
  return translate(useI18nStore.getState().locale, key, params);
}

export function useVoiceConversation(
  onToolCall: ToolCallHandler,
  opts?: { instructionsSuffix?: string },
) {
  const recorder = useAudioRecorder();
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  // Always-current practice suffix (e.g. a specific sentence to drill), so
  // the frozen `start` callback never reads a stale closure.
  const suffixRef = useRef(opts?.instructionsSuffix ?? '');
  useEffect(() => {
    suffixRef.current = opts?.instructionsSuffix ?? '';
  }, [opts?.instructionsSuffix]);
  const statusRef = useRef<ConversationStatus>('idle');
  // Earliest time (ms epoch) at which mic audio may be sent to the API again.
  const micUnmuteAtRef = useRef(0);
  // Always-current tool-call handler, so the frozen WS callbacks never call a
  // stale closure (same pattern as the imperative `t()` lookup above).
  const onToolCallRef = useRef(onToolCall);
  useEffect(() => {
    onToolCallRef.current = onToolCall;
  }, [onToolCall]);
  // call_id -> tool name, filled in when a function_call item starts and
  // consumed once its arguments finish streaming.
  const pendingToolCallsRef = useRef<Map<string, string>>(new Map());

  // --- Echo gate state (see the constants above) --------------------------
  /** Running estimate of the mic level attributable to speaker echo. */
  const echoFloorRef = useRef(0);
  /** True once the user has clearly spoken over the tutor this turn. */
  const echoGateOpenRef = useRef(false);
  /** Consecutive frames currently above the gate threshold. */
  const gateStreakRef = useRef(0);

  /** Called at the start of each tutor turn: nothing has been attributed to
   * the user yet, and the echo level is unknown again. */
  const resetEchoGate = () => {
    echoGateOpenRef.current = false;
    gateStreakRef.current = 0;
    echoFloorRef.current = 0;
  };

  const setConversationStatus = (next: ConversationStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const appendMessage = (id: string, role: ChatMessage['role'], delta: string, partial: boolean) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], text: next[idx].text + delta, partial };
        return next;
      }
      return [...prev, { id, role, text: delta, partial }];
    });
  };

  const finalizeMessage = (id: string, text?: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: text ?? m.text, partial: false } : m)),
    );
  };

  /**
 * Ensures the microphone runtime permission is granted before starting a session.
 * On Android this shows the system permission dialog; on iOS the audio session
 * request is handled natively by @siteed/audio-studio.
 */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: t('voice.micPermissionTitle'),
      message: t('voice.micPermissionMessage'),
      buttonPositive: t('voice.micPermissionAllow'),
      buttonNegative: t('voice.micPermissionDeny'),
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Streams microphone PCM to the Realtime API.
 *
 * Turn-taking differs by platform:
 * - iOS: `RECORDING_CONFIG.ios.audioSession.mode = 'VoiceChat'` enables
 *   hardware echo cancellation, so mic audio keeps flowing even while the
 *   tutor is talking (minus a brief grace window right as a turn starts).
 *   That's what makes voice barge-in possible — the server's VAD can hear
 *   the user start talking over the tutor and fires
 *   `input_audio_buffer.speech_started`, which cuts the tutor off.
 * - Android has no guaranteed hardware AEC across devices, so it keeps the
 *   original strict behavior: mic is fully muted for the whole tutor turn,
 *   and barge-in only works by tapping the mic (`interrupt()`).
 */
  // Diagnostic counters for the echo-loop: every 2s we log how many mic
  // frames were sent vs dropped while the tutor was speaking.
  const micStatsRef = useRef({ sent: 0, dropped: 0, lastLogAt: 0 });

  const handleAudioStream = async (event: AudioDataEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const dropped =
      Platform.OS === 'ios'
        ? Date.now() < micUnmuteAtRef.current
        : statusRef.current === 'speaking' || Date.now() < micUnmuteAtRef.current;
    const stats = micStatsRef.current;
    if (dropped) {
      stats.dropped += 1;
    } else {
      stats.sent += 1;
    }
    const now = Date.now();
    if (now - stats.lastLogAt > 2000) {
      stats.lastLogAt = now;
      debugLog('[voice] mic frames', JSON.stringify({ ...stats, status: statusRef.current, muteUntil: micUnmuteAtRef.current }));
      stats.sent = 0;
      stats.dropped = 0;
    }

    if (dropped) {
      return; // tutor is talking (or playback tail) — drop the echo
    }

    let samples: Float32Array;
    if (event.data instanceof Float32Array) {
      samples = event.data;
    } else if (Array.isArray(event.data)) {
      samples = Float32Array.from(event.data);
    } else {
      return; // raw base64 mode is not used
    }

    const micRms = rms(samples);
    // Feed the on-screen waveform with the real microphone level. Playback
    // has its own publisher, so only report while the tutor isn't talking —
    // otherwise the wave would show our own echo.
    if (statusRef.current !== 'speaking') {
      audioLevels.publish(micRms, 'mic');
    }

    // While the tutor is talking, only forward audio that is clearly louder
    // than the echo we are hearing from our own speaker — otherwise the
    // server's VAD treats the tutor's voice as an interruption and the
    // conversation loops (see the echo-gate notes above).
    if (statusRef.current === 'speaking' && !echoGateOpenRef.current) {
      const level = micRms;
      const threshold = Math.max(ECHO_GATE_MIN_RMS, echoFloorRef.current * ECHO_GATE_MARGIN);
      if (level > threshold) {
        gateStreakRef.current += 1;
        if (gateStreakRef.current >= ECHO_GATE_FRAMES) {
          echoGateOpenRef.current = true;
          debugLog('[voice] echo gate opened — treating as real barge-in');
        }
      } else {
        gateStreakRef.current = 0;
        // Only adapt the floor while we believe we're hearing echo, so the
        // user's own voice can't inflate the threshold against them.
        echoFloorRef.current += (level - echoFloorRef.current) * ECHO_FLOOR_ALPHA;
      }
      if (!echoGateOpenRef.current) {
        stats.dropped += 1;
        return;
      }
    }

    const resampled = resample(samples, RECORD_RATE, TARGET_RATE);
    ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: float32ToPcm16Base64(resampled),
      }),
    );
  };

  /**
   * Executes a tool call the model just made, then reports the result back
   * so the model can continue the turn. `onToolCall` (owned by the caller,
   * e.g. ChatScreen) does the actual REST work — this hook only speaks the
   * Realtime wire protocol.
   */
  const handleToolCall = async (name: string, callId: string, argsJson: string) => {
    let args: Record<string, unknown> = {};
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch (e) {
      if (__DEV__) console.warn('[voice] malformed tool arguments', name, argsJson, e);
    }

    let output: Record<string, unknown>;
    try {
      output = (await onToolCallRef.current(name, args)) ?? {};
    } catch (e) {
      output = { error: e instanceof Error ? e.message : 'tool call failed' };
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
      }),
    );
    ws.send(JSON.stringify({ type: 'response.create' }));
  };

  const handleServerEvent = (msg: {
    type: string;
    delta?: string;
    transcript?: string;
    item_id?: string;
    response_id?: string;
    call_id?: string;
    arguments?: string;
    item?: { type?: string; call_id?: string; name?: string };
    error?: { message?: string };
  }) => {
    // Trace the session lifecycle so the echo loop is diagnosable.
    if (
      msg.type !== 'response.output_audio.delta' &&
      msg.type !== 'conversation.item.input_audio_transcription.delta'
    ) {
      debugLog('[voice] event', msg.type);
    }
    switch (msg.type) {
      case 'session.updated':
        setConversationStatus('listening');
        recorder
          .startRecording({ ...RECORDING_CONFIG, onAudioStream: handleAudioStream })
          .catch((e) => {
            if (__DEV__) console.warn('[voice] failed to start recording', e);
            realtimeAudioPlayer.setSessionActive(false);
            setError(t('voice.micFailedToStart'));
            setConversationStatus('error');
          });
        break;

      case 'input_audio_buffer.speech_started':
        // The user began talking — cut the tutor off immediately (barge-in:
        // automatic on iOS once real mic audio reaches the server mid-turn,
        // or from a manual tap-to-interrupt on either platform).
        //
        // If the tutor is mid-turn and the echo gate never opened, we know we
        // forwarded no user speech, so whatever the server detected can only
        // be our own playback leaking into the mic. Honouring it there is
        // exactly what caused the interrupt/answer/interrupt loop.
        if (statusRef.current === 'speaking' && !echoGateOpenRef.current) {
          debugLog('[voice] ignoring speech_started — attributed to speaker echo');
          break;
        }
        realtimeAudioPlayer.clear();
        setConversationStatus('listening');
        break;

      case 'conversation.item.input_audio_transcription.delta':
        if (msg.item_id && msg.delta) {
          appendMessage(`user-${msg.item_id}`, 'user', msg.delta, true);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.item_id) {
          finalizeMessage(`user-${msg.item_id}`, msg.transcript);
        }
        break;

      case 'response.output_audio_transcript.delta':
        if (msg.response_id && msg.delta) {
          appendMessage(`tutor-${msg.response_id}`, 'tutor', msg.delta, true);
        }
        break;

      case 'response.output_audio_transcript.done':
        if (msg.response_id) {
          finalizeMessage(`tutor-${msg.response_id}`);
        }
        break;

      case 'response.output_audio.delta':
        if (statusRef.current !== 'speaking') {
          debugLog('[voice] tutor speaking starts');
          // New turn: re-learn the echo level and require the user to prove
          // they're really talking before we forward audio again.
          resetEchoGate();
          setConversationStatus('speaking');
          if (Platform.OS === 'ios') {
            micUnmuteAtRef.current = Date.now() + RESPONSE_START_GRACE_MS;
          }
        }
        if (msg.delta) {
          realtimeAudioPlayer.playPcm16Base64(msg.delta);
        }
        break;

      case 'response.output_audio.done': {
        // The API's "done" arrives before the queued audio has finished
        // playing, so keep the mic muted for the remaining playback plus a
        // safety margin — otherwise the tail of the tutor's sentence is heard
        // as the user's reply. Android needs the longer margin because it has
        // no guaranteed hardware AEC at all.
        const margin = Platform.OS === 'ios' ? POST_SPEECH_MUTE_IOS_MS : POST_SPEECH_MUTE_MS;
        micUnmuteAtRef.current = Date.now() + realtimeAudioPlayer.getRemainingPlaybackMs() + margin;
        debugLog(
          '[voice] tutor done — mute until',
          micUnmuteAtRef.current,
          '(remaining ms:',
          realtimeAudioPlayer.getRemainingPlaybackMs(),
          ')',
        );
        resetEchoGate();
        setConversationStatus('listening');
        break;
      }

      case 'response.done':
        break;

      // --- Tool calling ---------------------------------------------------
      case 'response.output_item.added':
        if (msg.item?.type === 'function_call' && msg.item.call_id && msg.item.name) {
          pendingToolCallsRef.current.set(msg.item.call_id, msg.item.name);
        }
        break;

      case 'response.function_call_arguments.done':
        if (msg.call_id) {
          const name = pendingToolCallsRef.current.get(msg.call_id);
          pendingToolCallsRef.current.delete(msg.call_id);
          if (name) {
            handleToolCall(name, msg.call_id, msg.arguments ?? '{}');
          }
        }
        break;

      case 'error':
        // If the session never started (e.g. the server rejected our
        // session.update — bad voice, oversized instructions), an error
        // event is the only signal we get; surface it instead of hanging
        // forever in 'connecting'. Mid-session errors are recoverable and
        // only logged.
        if (statusRef.current === 'connecting') {
          // The session never started — nothing to keep open: drop the
          // socket now (the next start() would clean it up anyway, but a
          // dead session shouldn't sit on an open connection).
          realtimeAudioPlayer.setSessionActive(false);
          const ws = wsRef.current;
          wsRef.current = null;
          if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            try {
              ws.close();
            } catch {
              // ignore
            }
          }
          setError(
            msg.error?.message
              ? t('voice.sessionError', { message: msg.error.message })
              : t('voice.sessionEnded'),
          );
          setConversationStatus('error');
        } else if (__DEV__) {
          console.warn('[voice] realtime error', msg.error?.message ?? msg.type);
        }
        break;

      default:
        break;
    }
  };

  /**
   * User tapped while the tutor is speaking: stop her, drop the audio queue,
   * and let the mic listen again. Works on both platforms regardless of
   * whether automatic voice barge-in is active.
   */
  const interrupt = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (statusRef.current !== 'speaking') return;
    await realtimeAudioPlayer.clear();
    micUnmuteAtRef.current = 0;
    resetEchoGate();
    ws.send(JSON.stringify({ type: 'response.cancel' }));
    setConversationStatus('listening');
  }, []);

  const stopInternal = useCallback(async () => {
    setConversationStatus('idle');
    realtimeAudioPlayer.setSessionActive(false);
    try {
      await recorder.stopRecording();
    } catch {
      // not recording
    }
    await realtimeAudioPlayer.clear();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }, [recorder.stopRecording]);

  const start = useCallback(async () => {
    await stopInternal();
    setError(null);
    setMessages([]);
    pendingToolCallsRef.current.clear();
    resetEchoGate();

    // Ask for the microphone first — on Android this triggers the system popup.
    // (Must happen before any @siteed/audio-studio call: its internal request
    // runs from a background context on Android and is silently denied.)
    const micGranted = await ensureMicPermission();
    if (!micGranted) {
      setError(t('voice.micPermissionRequired'));
      setConversationStatus('error');
      return;
    }

    // Pre-initialize the audio pipeline now that the permission is granted,
    // so recording starts with zero latency once the session is ready.
    recorder.prepareRecording(RECORDING_CONFIG).catch(() => {
      // startRecording will surface real errors when the session starts.
    });

    setConversationStatus('connecting');

    let secret: string;
    let instructions: string;
    let tools: RealtimeTool[];
    // The voice the server minted the session with — the learner's chosen
    // tutor voice, or their course's default.
    let startSessionVoice: string;
    try {
      const res = await getRealtimeClientSecret();
      secret = res.value;
      instructions = res.instructions ?? FALLBACK_TUTOR_PROMPT;
      tools = res.tools ?? [];
      startSessionVoice = res.voice ?? FALLBACK_VOICE;
      if (suffixRef.current) instructions += `\n\n${suffixRef.current}`;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // The JWT expired or was revoked — bounce to the login screen.
        useAuthStore.getState().signOut();
        return;
      }
      setError(e instanceof Error ? e.message : t('voice.couldNotStartSession'));
      setConversationStatus('error');
      return;
    }

    // The session is now committed — mark it live so the XP chime stays
    // silent for the whole conversation (a ding mid-dialogue would bleed
    // into the live mic); the flag is cleared on every close path below.
    realtimeAudioPlayer.setSessionActive(true);

    const ws = new WebSocket(REALTIME_URL, [
      'realtime',
      `openai-insecure-api-key.${secret}`,
    ]);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            model: 'gpt-realtime-2.1',
            instructions,
            output_modalities: ['audio'],
            tools,
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: TARGET_RATE },
                transcription: { model: 'gpt-live-transcribe' },
                turn_detection: { type: 'semantic_vad', eagerness: 'medium' },
              },
              output: {
                format: { type: 'audio/pcm', rate: TARGET_RATE },
                voice: startSessionVoice,
              },
            },
          },
        }),
      );
    };

    ws.onmessage = (event) => {
      let msg: Parameters<typeof handleServerEvent>[0];
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      handleServerEvent(msg);
    };

    ws.onerror = () => {
      realtimeAudioPlayer.setSessionActive(false);
      setError(t('voice.connectionLost'));
      setConversationStatus('error');
    };

    ws.onclose = () => {
      realtimeAudioPlayer.setSessionActive(false);
      if (statusRef.current !== 'idle') {
        setError(t('voice.sessionEnded'));
        setConversationStatus('error');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      stopInternal();
      realtimeAudioPlayer.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, messages, error, start, stop: stopInternal, interrupt };
}
