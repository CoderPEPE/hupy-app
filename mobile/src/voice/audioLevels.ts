/**
 * Live audio level bus.
 *
 * Both ends of the conversation publish here so the UI can draw a waveform
 * from the audio that is actually happening:
 *   - the microphone stream publishes what the user is saying
 *     (`useVoiceConversation.handleAudioStream`)
 *   - the playback queue publishes what the tutor is saying, scheduled to the
 *     moment each chunk is actually audible (`RealtimeAudioPlayer`)
 *
 * Deliberately not React state: levels arrive ~10-25x/second and would
 * re-render the whole Chat screen. Subscribers (the waveform) drive
 * `Animated.Value`s directly instead.
 */

export type AudioSource = 'mic' | 'playback';

type Listener = (level: number, source: AudioSource) => void;

/**
 * RMS of ordinary speech sits well below 1.0, so scale it into a usable
 * display range. Values above this read as "full height".
 */
const FULL_SCALE_RMS = 0.25;

/** Normalizes a raw RMS reading to 0..1 for display, with a gentle curve so
 * quiet speech is still visible. */
export function normalizeLevel(rmsValue: number): number {
  const linear = Math.min(1, Math.max(0, rmsValue / FULL_SCALE_RMS));
  return Math.sqrt(linear);
}

class AudioLevelBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Publishes a raw RMS reading (0..1). */
  publish(rmsValue: number, source: AudioSource): void {
    if (this.listeners.size === 0) return;
    const level = normalizeLevel(rmsValue);
    this.listeners.forEach((l) => l(level, source));
  }
}

export const audioLevels = new AudioLevelBus();
