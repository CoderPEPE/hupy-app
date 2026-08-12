import { AudioBufferSourceNode, AudioContext } from 'react-native-audio-api';
import { getSpeech } from '../api/tts';
import { configureIosSession } from './audioEngine';

/**
 * Plays short TTS clips (flashcard "Listen", correction "Hear it", planet
 * continuous audio). MP3 bytes come from the backend proxy and are decoded
 * on-device via AudioContext.decodeAudioData, then played through the same
 * PlayAndRecord session so the mic stays usable afterwards.
 *
 * Note: this player keeps its own AudioContext (separate from the Realtime
 * player's) on purpose — TTS clips and live Realtime sessions are never used
 * at the same time, and both configure the identical AVAudioSession options.
 * The context lives for the app's lifetime (a single context is not a leak).
 */
class SpeechPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private currentVoice: string | undefined = undefined;

  private async getContext(): Promise<AudioContext> {
    if (!this.context) {
      configureIosSession();
      this.context = new AudioContext();
      await this.context.resume();
    }
    return this.context;
  }

  /** Permanently sets the voice clips fall back to when none is passed. */
  setVoice(voice: string): void {
    this.currentVoice = voice;
  }

  /**
   * Speaks `text` out loud. Resolves once playback has actually finished
   * (or failed), with the clip duration in seconds (0 on failure), so callers
   * can keep "Playing…" states accurate. `voice` sets the TTS voice; when
   * omitted the previous voice (or the server default) is used. With
   * `{ ephemeral: true }` the voice is used for this clip only and does not
   * become the remembered fallback — the voice picker's previews use this so
   * auditioning a voice can't change what the app actually speaks with.
   */
  async speak(text: string, voice?: string, opts?: { ephemeral?: boolean }): Promise<number> {
    // Don't overlap clips: a new speak cancels whatever is playing.
    await this.stop();
    if (voice !== undefined && !opts?.ephemeral) this.currentVoice = voice;
    // An explicit voice always wins — including ephemeral previews, which
    // must NOT touch this.currentVoice but still need to be heard with the
    // voice being auditioned (otherwise every preview sounds the same).
    const speakWith = voice ?? this.currentVoice;
    try {
      const ctx = await this.getContext();
      const bytes = await getSpeech(text, undefined, speakWith);
      const buffer = await ctx.decodeAudioData(bytes);
      if (buffer.length === 0) return 0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const duration = buffer.duration;
      return await new Promise<number>((resolve) => {
        let settled = false;
        // Safety net in case onEnded never fires; cleared once either path
        // settles so no orphaned timer outlives the clip.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          this.sources.delete(source);
          resolve(duration);
        };
        source.onEnded = finish;
        timer = setTimeout(finish, duration * 1000 + 500);
        source.start();
        this.sources.add(source);
      });
    } catch {
      return 0;
    }
  }

  /** Stops any clip currently playing. */
  async stop(): Promise<void> {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    this.sources.clear();
  }

  get isPlaying(): boolean {
    return this.sources.size > 0;
  }
}

export const speechPlayer = new SpeechPlayer();

/** The OpenAI TTS voice for a course's target language — mirrors the
 * backend's per-language Realtime voices (en=marin, es=coral, pt=shimmer). */
export function ttsVoiceFor(language: string): string {
  switch (language) {
    case 'es':
      return 'coral';
    case 'pt':
      return 'shimmer';
    default:
      return 'marin';
  }
}

/** Resolves the effective voice for TTS playback: the learner's stored
 * choice (from `user.voice`), falling back to the course's default voice. */
export function effectiveVoice(storedVoice: string, language: string): string {
  const v = storedVoice.trim();
  return v ? v : ttsVoiceFor(language);
}
