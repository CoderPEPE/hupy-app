import { AudioContext } from 'react-native-audio-api';
import { shouldChimeXpGain } from '../gamification/xpFloat';
import { configureIosSession, configurePlaybackSession, realtimeAudioPlayer } from './audioEngine';
import { speechPlayer } from './ttsPlayer';

/**
 * Synthesizes a short, soft two-tone chime (A5 + E6 — a fifth apart, bright
 * but not shrill) with a fast attack and an exponential decay, mixed to a
 * quiet envelope so it reads as "reward" rather than "alarm". No audio asset
 * needed: the PCM buffer is built here and played straight through the Web
 * Audio-style context.
 */
function synthesizeChime(sampleRate: number): Float32Array<ArrayBuffer> {
  const durationSec = 0.5;
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  const f1 = 880; // A5
  const f2 = 1318.51; // E6
  const attackSec = 0.008;
  const decay = 7; // env ≈ -30dB at the 0.5s tail
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / attackSec) * Math.exp(-t * decay);
    out[i] = env * (0.62 * Math.sin(2 * Math.PI * f1 * t) + 0.38 * Math.sin(2 * Math.PI * f2 * t));
  }
  return out;
}

/**
 * The reward chime that lands with the "+N XP" badge and the fill bar —
 * same gain, same moment, one story. Fired from FloatingXp on every XP gain;
 * this player guarantees at most ONE chime per gain (several bar instances
 * may be mounted across cached tabs, all watching the same stats query) and
 * never talks over the tutor:
 *
 * - dedup: `shouldChimeXpGain` keys on the XP *total*, which is monotonic
 *   server-side, so each gain chimes exactly once app-wide;
 * - guard: while a TTS clip is playing or live Realtime audio is queued, the
 *   chime is dropped (not queued — a delayed ding would desync from the
 *   float), so the teacher is never interrupted by a synthetic beep.
 *
 * Best-effort by design: it never throws, and a failed chime must never
 * break the XP flow that triggered it.
 */
class XpChimePlayer {
  private context: AudioContext | null = null;
  /** XP total of the last gain actually chimed for (null = none yet). */
  private lastChimedXp: number | null = null;

  private async getContext(): Promise<AudioContext> {
    if (!this.context) {
      // Full-quality playback unless a live conversation owns the session,
      // in which case its mic-preserving options have to stay.
      if (realtimeAudioPlayer.isSessionActive) configureIosSession();
      else configurePlaybackSession();
      this.context = new AudioContext();
      await this.context.resume();
    }
    return this.context;
  }

  /** Call on every XP gain. Resolves immediately; the chime is fire-and-forget. */
  async play(xp: number): Promise<void> {
    if (!shouldChimeXpGain(this.lastChimedXp, xp)) return;
    // Never over the tutor: while a TTS clip is on the air, while live
    // Realtime audio is queued, or while a voice conversation is open at all
    // (a ding mid-dialogue is odd, and it would bleed into the live mic).
    if (
      speechPlayer.isPlaying ||
      realtimeAudioPlayer.isSessionActive ||
      realtimeAudioPlayer.getRemainingPlaybackMs() > 0
    ) {
      return;
    }
    // Record the total we're about to sound for synchronously, before any
    // await: a second mounted instance seeing the same xp in the same frame
    // must not also chime.
    this.lastChimedXp = xp;
    try {
      const ctx = await this.getContext();
      const samples = synthesizeChime(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.18; // subtle — feedback, not an alarm
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // Audio is best-effort — a failed chime must never break the XP flow.
    }
  }
}

export const xpChimePlayer = new XpChimePlayer();
