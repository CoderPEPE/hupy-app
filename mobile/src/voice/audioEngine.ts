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

/** OpenAI Realtime audio output format: 24 kHz mono PCM16. */
const OUTPUT_SAMPLE_RATE = 24000;

class RealtimeAudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  /** Wall-clock (Date.now) time at which all queued audio has finished playing. */
  private playbackEndAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  /** Pending level-meter publishes, so `clear()` (barge-in) can cancel the
   * waveform updates for audio that will now never be heard. */
  private levelTimers = new Set<ReturnType<typeof setTimeout>>();

  /**
   * Reports the loudness of a chunk to the waveform at the moment it actually
   * becomes audible. Chunks are queued ahead of the speaker, so publishing on
   * arrival would run the visualization ahead of the sound.
   *
   * Long chunks are sampled in ~80 ms slices so the wave tracks the shape of
   * the speech rather than flat-lining at one value per chunk.
   */
  private scheduleLevels(samples: Float32Array, rate: number, startInMs: number): void {
    const sliceMs = 80;
    const sliceLen = Math.max(1, Math.floor((rate * sliceMs) / 1000));
    for (let offset = 0, i = 0; offset < samples.length; offset += sliceLen, i++) {
      const slice = samples.subarray(offset, Math.min(offset + sliceLen, samples.length));
      const level = rms(slice);
      const timer = setTimeout(() => {
        this.levelTimers.delete(timer);
        audioLevels.publish(level, 'playback');
      }, startInMs + i * sliceMs);
      this.levelTimers.add(timer);
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
        // When the last buffer finishes, playback is truly done.
        if (this.sources.size === 0 && this.playbackEndAt > 0) {
          this.playbackEndAt = 0;
        }
      };
    } catch (e) {
      console.warn('[audio] playback error', e);
    }
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
        source.stop();
      } catch {
        // already stopped
      }
    });
    this.sources.clear();
    // Drop queued waveform updates for audio that is no longer going to play,
    // then flatten the meter.
    this.levelTimers.forEach(clearTimeout);
    this.levelTimers.clear();
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
