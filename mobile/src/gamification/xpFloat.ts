/** Maximum number of floats shown at once; older ones drop off. */
export const MAX_FLOATS = 3;

/** How long a floating "+N XP" badge takes to rise and fade. The header XP
 * bar uses the same duration for the same gain (see fillAnimKind), so the
 * fill counts up in step with the badge — one motion, one story. */
export const FLOAT_MS = 1500;

/** A float's data — deliberately free of Animated values, so this module
 * stays pure and the caller attaches its own animation handle. */
export type XpFloatSpec = { id: number; amount: number };

/**
 * The positive XP gained since the previous sight of the stats, or null when
 * nothing should float: first sight baselines silently (a freshly-mounted
 * screen must not celebrate XP it never saw being earned), and non-positive
 * deltas are ignored (an XP reset is not a gain).
 */
export function xpGain(prevXp: number | null, newXp: number): number | null {
  if (prevXp == null || newXp <= prevXp) return null;
  return newXp - prevXp;
}

/**
 * Append a new float to the stack, newest first, dropping the oldest past
 * `maxFloats`. Newest-first ordering is what keeps the visual ladder stable:
 * the oldest float is always the *last* element, so eviction — and the
 * completion removal of the same oldest float — never reindexes the floats
 * still on screen, and each one keeps its vertical slot until a newer float
 * pushes the stack up.
 */
export function pushXpFloat(
  floats: XpFloatSpec[],
  next: XpFloatSpec,
  maxFloats: number = MAX_FLOATS,
): XpFloatSpec[] {
  return [next, ...floats.slice(0, maxFloats - 1)];
}

export type FillAnimKind = 'mount' | 'gain' | 'levelup' | 'drain';

/**
 * Decide how the header XP bar should animate for a stats change:
 *
 * - `mount` — first sight of the data (fresh screen, tab switch): fill
 *   quietly from 0; nothing was seen being earned, so no celebration.
 * - `gain` — same-level XP gain: the bar counts up over FLOAT_MS, in step
 *   with the "+N XP" float that spawns from the very same delta.
 * - `levelup` — the gain crossed a level boundary, so the bar wrapped (e.g.
 *   95% → 5%): play a complete-and-recharge instead of sliding backwards.
 * - `drain` — XP stayed flat or dropped (a reset): settle quickly, quietly.
 */
export function fillAnimKind(
  prevXp: number | null,
  newXp: number,
  prevPct: number,
  newPct: number,
): FillAnimKind {
  if (prevXp == null) return 'mount';
  if (newXp <= prevXp) return 'drain';
  if (newPct < prevPct) return 'levelup';
  return 'gain';
}

/** Duration of the first level-up fill step — finishing off the old level's
 * bar (to 100%) before it resets. */
export const LEVEL_UP_TOP_UP_MS = 280;

/**
 * The three fill steps of a level-up sweep, in order: complete the old
 * level's bar, reset it to empty (a near-instant 1ms step), then charge the
 * new level's remainder. The steps sum to exactly `floatMs` (default
 * FLOAT_MS) so the whole sweep lands the moment the "+N XP" badge finishes
 * its rise — the fill and the float stay one story. Requires
 * `floatMs >= LEVEL_UP_TOP_UP_MS + 1` (at the minimum, the charge step is
 * zero).
 */
export function levelUpFillSteps(floatMs: number = FLOAT_MS): readonly number[] {
  const resetMs = 1;
  return [LEVEL_UP_TOP_UP_MS, resetMs, floatMs - LEVEL_UP_TOP_UP_MS - resetMs];
}

/**
 * Whether this XP total should sound the reward chime: true for the first
 * ever sight and for any total higher than the last one chimed for. Because
 * server XP is monotonic, keying on the *total* (rather than a per-instance
 * baseline) makes this an exact once-per-gain dedup — every mounted bar
 * instance (cached tabs all watch the same stats query) can call the player
 * and at most one chime sounds per gain.
 */
export function shouldChimeXpGain(lastChimedXp: number | null, xp: number): boolean {
  return lastChimedXp == null || xp > lastChimedXp;
}
