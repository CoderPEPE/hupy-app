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

  private async getContext(): Promise<AudioContext> {
    if (!this.context) {
      configureIosSession();
      this.context = new AudioContext();
      await this.context.resume();
    }
    return this.context;
  }

  /**
   * Speaks `text` out loud. Resolves once playback has actually finished
   * (or failed), with the clip duration in seconds (0 on failure), so callers
   * can keep "Playing…" states accurate.
   */
  async speak(text: string): Promise<number> {
    // Don't overlap clips: a new speak cancels whatever is playing.
    await this.stop();
    try {
      const ctx = await this.getContext();
      const bytes = await getSpeech(text);
      const buffer = await ctx.decodeAudioData(bytes);
      if (buffer.length === 0) return 0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const duration = buffer.duration;
      return await new Promise<number>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          this.sources.delete(source);
          resolve(duration);
        };
        source.onEnded = finish;
        // Safety net in case onEnded never fires.
        setTimeout(finish, duration * 1000 + 500);
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
