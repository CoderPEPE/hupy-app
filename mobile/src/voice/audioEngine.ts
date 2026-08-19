import {
  AudioBufferSourceNode,
  AudioContext,
  AudioManager,
} from 'react-native-audio-api';
import { pcm16Base64ToFloat32, resample, rms } from './audioCodec';
import { audioLevels } from './audioLevels';

/**
 * Keep the iOS AVAudioSession in PlayAndRecord/VoiceChat so the recorder's
 * microphone input stays live while the tutor's audio plays back.
 * Without this, react-native-audio-api reconfigures the session to
 * Playback-only the first time an AudioContext plays audio, which kills the
 * mic input mid-conversation.
 */
export function configureIosSession(): void {
  AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'voiceChat',
    iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
  });
}

/**
 * Session options for playback that has no microphone alongside it: the audio
 * stories, flashcard TTS and the XP chime.
 *
 * PlayAndRecord + VoiceChat exists to keep hardware echo cancellation running
 * while the mic is live, and it costs real fidelity — iOS drops the route to
 * telephony quality and a paired Bluetooth device to the HFP profile, which
 * is why stories sounded like a phone call. Nothing here records, so it uses
 * plain playback.
 *
 * Only safe while no conversation is open; callers must check
 * `realtimeAudioPlayer.isSessionActive` first, because switching category
 * mid-conversation would drop the microphone.
 */
export function configurePlaybackSession(): void {
  AudioManager.setAudioSessionOptions({
    iosCategory: 'playback',
    iosMode: 'default',
    iosOptions: [],
  });
}

/** OpenAI Realtime audio output format: 24 kHz mono PCM16. */
const OUTPUT_SAMPLE_RATE = 24000;

class RealtimeAudioPlayer {
  /** How far ahead of the speaker playback may be queued before new audio is
   * dropped. Bounds the memory held by scheduled-but-unplayed buffers when
   * the JS thread falls behind (slow device, GC pressure, an error handler
   * grinding the runtime) — the tutor's audio hiccups instead of the queue
   * (and the app's memory) growing for the whole session. */
  private static QUEUE_LIMIT_MS = 20_000;
  /** Hard ceiling on simultaneously alive buffer sources. This is a runaway
   * guard only — `QUEUE_LIMIT_MS` above is the real budget. It used to be 64,
   * which the Realtime API's ~100 ms deltas hit after ~6 s of audio, so the
   * middle of a long sentence was silently dropped while the intended 20 s
   * budget still had room. */
  private static MAX_SOURCES = 512;

  private context: AudioContext | null = null;
  /** True while a live voice conversation is open — the XP chime player uses
   * this to stay silent during conversations (a synthetic ding mid-dialogue
   * is odd, and it would bleed into the live microphone). Set by
   * `useVoiceConversation` as the session opens and closes. */
  private sessionActive = false;
  private nextStartTime = 0;
  /** Wall-clock (Date.now) time at which all queued audio has finished playing. */
  private playbackEndAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  /** Pending level-meter publishes, so `clear()` (barge-in) can cancel the
   * waveform updates for audio that will now never be heard. Slices are
   * pushed onto a single queue drained by one interval — publishing a level
   * never costs a live timer object per slice, so a long turn can't build up
   * thousands of timers. */
  private levelQueue: Array<{ level: number; dueAt: number }> = [];
  private levelTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Reports the loudness of a chunk to the waveform at the moment it actually
   * becomes audible. Chunks are queued ahead of the speaker, so publishing on
   * arrival would run the visualization ahead of the sound.
   *
   * Long chunks are sampled in ~80 ms slices so the wave tracks the shape of
   * the speech rather than flat-lining at one value per chunk. Slices are
   * stamped with their wall-clock due time and drained by a single interval.
   */
  private scheduleLevels(samples: Float32Array, rate: number, startInMs: number): void {
    const sliceMs = 80;
    const sliceLen = Math.max(1, Math.floor((rate * sliceMs) / 1000));
    const baseDueAt = Date.now() + Math.max(0, startInMs);
    for (let offset = 0, i = 0; offset < samples.length; offset += sliceLen, i++) {
      const slice = samples.subarray(offset, Math.min(offset + sliceLen, samples.length));
      this.levelQueue.push({ level: rms(slice), dueAt: baseDueAt + i * sliceMs });
    }
    if (!this.levelTimer) {
      this.levelTimer = setInterval(() => this.flushLevels(), sliceMs);
    }
  }

  /** Publishes every level whose moment has arrived; stops the interval once
   * the queue is empty. */
  private flushLevels(): void {
    const now = Date.now();
    while (this.levelQueue.length > 0 && this.levelQueue[0].dueAt <= now) {
      audioLevels.publish(this.levelQueue.shift()!.level, 'playback');
    }
    if (this.levelQueue.length === 0 && this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
  }

  private async getContext(): Promise<AudioContext> {
    if (!this.context) {
      // Apply our shared session config before the AudioContext is created,
      // otherwise the library defaults to Playback-only (mic dies on iOS).
      configureIosSession();
      this.context = new AudioContext();
      await this.context.resume();
    }
    return this.context;
  }

  /** Queues a base64 PCM16 chunk for gapless playback. */
  async playPcm16Base64(base64: string): Promise<void> {
    try {
      const ctx = await this.getContext();
      // If playback is already this far behind, drop the incoming chunk
      // instead of enqueueing: the backlog is bounded by QUEUE_LIMIT_MS of
      // buffers, not by the length of the conversation.
      const queuedMs = (this.nextStartTime - ctx.currentTime) * 1000;
      if (queuedMs > RealtimeAudioPlayer.QUEUE_LIMIT_MS || this.sources.size >= RealtimeAudioPlayer.MAX_SOURCES) {
        return;
      }
      const float32 = pcm16Base64ToFloat32(base64);
      if (float32.length === 0) return;

      // The API sends 24 kHz audio, but AudioBufferSourceNode renders at the
      // AudioContext's native sample rate (device rate, e.g. 48 kHz on iOS).
      // Without resampling, playback is sped up and pitch-shifted (chipmunk).
      const ctxRate = ctx.sampleRate;
      const samples =
        ctxRate === OUTPUT_SAMPLE_RATE
          ? float32
          : resample(float32, OUTPUT_SAMPLE_RATE, ctxRate);

      const buffer = ctx.createBuffer(1, samples.length, ctxRate);
      buffer.copyToChannel(samples, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const when = Math.max(ctx.currentTime, this.nextStartTime);
      source.start(when);
      this.nextStartTime = when + buffer.duration;
      // The buffer plays at context time `when` .. `when + duration`. Convert
      // that span to wall-clock so callers can mute the mic until the speaker
      // is truly silent (ctx.currentTime tracks audio time, ~Date.now).
      const ctxNow = ctx.currentTime;
      const startIn = Math.max(0, when - ctxNow);
      this.playbackEndAt = Math.max(this.playbackEndAt, Date.now() + startIn * 1000 + buffer.duration * 1000);
      this.scheduleLevels(samples, ctxRate, startIn * 1000);
      this.sources.add(source);
      source.onEnded = () => {
        this.sources.delete(source);
        // Nulling the handler is what actually unregisters it: the library's
        // setter adds an event listener and throws the subscription away, so
        // the only path that ever calls `unregisterCallback` is its falsy
        // branch. Without this every chunk's source node and its decoded PCM
        // stay alive in the native registry, and memory climbs for the whole
        // conversation.
        source.onEnded = null;
        // When the last buffer finishes, playback is truly done.
        if (this.sources.size === 0 && this.playbackEndAt > 0) {
          this.playbackEndAt = 0;
        }
      };
    } catch (e) {
      console.warn('[audio] playback error', e);
    }
  }

  /** Marks whether a live voice conversation is currently open. */
  setSessionActive(active: boolean): void {
    this.sessionActive = active;
  }

  get isSessionActive(): boolean {
    return this.sessionActive;
  }

  /**
   * Milliseconds of tutor audio still queued and not yet played, 0 if idle.
   * The API fires response.output_audio.done when streaming finishes, but the
   * queued buffers may still be playing — callers use this to keep the mic
   * muted until the speaker is truly silent.
   */
  /**
   * Milliseconds until all queued tutor audio has truly finished playing
   * (wall-clock estimate), or 0 if the queue is empty.
   */
  getRemainingPlaybackMs(): number {
    if (this.playbackEndAt > 0) {
      return Math.max(0, this.playbackEndAt - Date.now());
    }
    if (!this.context) return 0;
    const remaining = this.nextStartTime - this.context.currentTime;
    return Math.max(0, remaining * 1000);
  }

  /** Immediately stops playback and drops the queue (used for barge-in). */
  async clear(): Promise<void> {
    this.sources.forEach((source) => {
      try {
        // Unregister before stopping: `stop()` normally fires `ended`, whose
        // handler releases the listener, but a source that is already stopped
        // throws and would never fire it — leaking the native callback.
        source.onEnded = null;
        source.stop();
      } catch {
        // already stopped
      }
    });
    this.sources.clear();
    // Drop queued waveform updates for audio that is no longer going to play,
    // then flatten the meter.
    this.levelQueue = [];
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    audioLevels.publish(0, 'playback');
    this.nextStartTime = 0;
    this.playbackEndAt = 0;
  }

  async close(): Promise<void> {
    await this.clear();
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore
      }
      this.context = null;
    }
  }
}

export const realtimeAudioPlayer = new RealtimeAudioPlayer();
