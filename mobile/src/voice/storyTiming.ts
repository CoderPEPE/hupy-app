/**
 * Timing math for the planet audio stories.
 *
 * The stories are spoken through TTS one sentence at a time, so there is no
 * media file with a real timeline — the player derives one by estimating each
 * sentence's duration from its word count. Kept here, free of React Native
 * imports, so it stays unit-testable on its own.
 */

/** Words per second used to estimate each unit's duration (≈150 wpm). */
const WPS = 2.5;

export function unitSecs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WPS));
}

/** Maps an elapsed-time target (seconds) to the unit index it falls in. */
export function indexForElapsed(units: string[], elapsed: number): number {
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    const d = unitSecs(units[i]);
    if (elapsed < acc + d) return i;
    acc += d;
  }
  return Math.max(0, units.length - 1);
}

/** Where unit `i` starts, in seconds — the seek target for "previous/next
 * sentence", which land on a boundary rather than mid-phrase. */
export function unitStart(units: string[], i: number): number {
  let acc = 0;
  for (let n = 0; n < Math.min(i, units.length); n++) acc += unitSecs(units[n]);
  return acc;
}

export function formatTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}
