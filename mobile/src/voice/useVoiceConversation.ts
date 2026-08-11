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
import { float32ToPcm16Base64, resample } from './audioCodec';
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
const VOICE = 'coral'; // ChatGPT's default Advanced Voice — warm and conversational

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
 * `RECORDING_CONFIG.ios.audioSession`) instead of a full mute.
 */
const RESPONSE_START_GRACE_MS = 150;

// Only used if the backend is too old to return the canonical instructions.
const FALLBACK_TUTOR_PROMPT =
  'You are Huppy, a patient English tutor for a Brazilian Portuguese speaker. Teach before testing: ' +
  'present each sentence in English, explain in Portuguese, demonstrate pronunciation, ask for ' +
  'three repetitions, correct mistakes gently, and review previous content at unexpected moments. ' +
  'Keep replies short and encouraging. The learner\'s name is Sergio.';

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

export function useVoiceConversation(onToolCall: ToolCallHandler) {
  const recorder = useAudioRecorder();
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
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
            setError(t('voice.micFailedToStart'));
            setConversationStatus('error');
          });
        break;

      case 'input_audio_buffer.speech_started':
        // The user began talking — cut the tutor off immediately (barge-in:
        // automatic on iOS once real mic audio reaches the server mid-turn,
        // or from a manual tap-to-interrupt on either platform).
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
          setConversationStatus('speaking');
          if (Platform.OS === 'ios') {
            micUnmuteAtRef.current = Date.now() + RESPONSE_START_GRACE_MS;
          }
        }
        if (msg.delta) {
          realtimeAudioPlayer.playPcm16Base64(msg.delta);
        }
        break;

      case 'response.output_audio.done':
        // Android only: keep the mic muted until the queued playback has
        // actually finished (the API's "done" arrives before the audio
        // finishes playing), plus a small safety margin. iOS relies on
        // hardware echo cancellation instead and stays live throughout.
        if (Platform.OS !== 'ios') {
          micUnmuteAtRef.current =
            Date.now() + realtimeAudioPlayer.getRemainingPlaybackMs() + POST_SPEECH_MUTE_MS;
          debugLog(
            '[voice] tutor done — mute until',
            micUnmuteAtRef.current,
            '(remaining ms:',
            realtimeAudioPlayer.getRemainingPlaybackMs(),
            ')',
          );
        }
        setConversationStatus('listening');
        break;

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
        // Recoverable API errors (e.g. rejected session.update) shouldn't kill the session.
        if (__DEV__) console.warn('[voice] realtime error', msg.error?.message ?? msg.type);
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
    ws.send(JSON.stringify({ type: 'response.cancel' }));
    setConversationStatus('listening');
  }, []);

  const stopInternal = useCallback(async () => {
    setConversationStatus('idle');
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
    try {
      const res = await getRealtimeClientSecret();
      secret = res.value;
      instructions = res.instructions ?? FALLBACK_TUTOR_PROMPT;
      tools = res.tools ?? [];
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
                voice: VOICE,
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
      setError(t('voice.connectionLost'));
      setConversationStatus('error');
    };

    ws.onclose = () => {
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
