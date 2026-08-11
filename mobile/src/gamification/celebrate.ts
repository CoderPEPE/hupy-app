import type { Achievement } from '../api/gamification';
import { levelFromXp } from './levels';

/** Never stack more than this many toasts at once. */
export const MAX_VISIBLE_TOASTS = 2;

// ---------------------------------------------------------------------------
// Level-up + achievement detection (pure)
// ---------------------------------------------------------------------------

export type CelebrationInput = {
  xp: number;
  /** The previous sight of the total XP (null on first sight). The delta
   * between it and `xp` is the XP this snapshot granted — the single shared
   * number behind the level-up modal's chip and the header's floating badge. */
  prevXp: number | null;
  /** The full achievement list from the stats endpoint; `earned_at`
   * non-null means the achievement is earned. */
  achievements: Achievement[];
  /** Persisted last level; null = the stats have never been seen before. */
  lastLevel: number | null;
  /** Persisted codes of achievements already toasted. */
  seenCodes: string[];
};

export type CelebrationDecision = {
  /** Set when the level went up and this isn't the first sight of the stats.
   * `xpGained` is the delta that caused it. */
  levelUp: { level: number; xp: number; xpGained: number } | null;
  /** Earned achievements never toasted before — empty on first sight, where
   * everything adopts silently (an upgrade must not celebrate the past). */
  freshAchievements: Achievement[];
  firstSight: boolean;
  /** The level to persist after this decision. */
  nextLastLevel: number;
  /** The union of seen codes to persist (same reference as input when
   * nothing new was earned, so callers can skip pointless writes). */
  nextSeenCodes: string[];
  /** The XP this snapshot granted, or null when it can't be stated (first
   * sight baselines, and XP resets are not gains). */
  xpGained: number | null;
};

/**
 * Turns one gamification snapshot into the celebration to show. Pure and
 * side-effect free — the caller applies storage and state from the decision.
 *
 * - First sight of the stats adopts the current level silently and marks
 *   every already-earned achievement as seen, so a fresh install or an
 *   upgrade never re-celebrates the past.
 * - A level that went up fires a level-up (multi-level jumps included); a
 *   level that dropped (account reset) re-baselines silently.
 */
export function decideCelebration(input: CelebrationInput): CelebrationDecision {
  const level = levelFromXp(input.xp);
  const firstSight = input.lastLevel == null;

  // The gain is the same number every celebration surface shows: the level-up
  // modal's chip, the achievement toast's reward (a portion of it), and the
  // header float — all derived from the same real delta of the server total.
  const xpGained =
    input.prevXp != null && input.xp > input.prevXp ? input.xp - input.prevXp : null;

  const levelUp =
    !firstSight && level > input.lastLevel!
      ? { level, xp: input.xp, xpGained: xpGained ?? 0 }
      : null;

  const earned = input.achievements.filter((a) => a.earned_at != null);
  const fresh = earned.filter((a) => !input.seenCodes.includes(a.code));
  const nextSeenCodes =
    fresh.length > 0 ? [...input.seenCodes, ...fresh.map((a) => a.code)] : input.seenCodes;

  return {
    levelUp,
    freshAchievements: firstSight ? [] : fresh,
    firstSight,
    nextLastLevel: level,
    nextSeenCodes,
    xpGained,
  };
}

// ---------------------------------------------------------------------------
// Toast queue (pure)
// ---------------------------------------------------------------------------

export type ToastQueue = { visible: Achievement[]; queue: Achievement[] };

/**
 * Append freshly earned achievements to the queue and fill the visible stack
 * up to `maxVisible`. FIFO: the earliest arrivals show first, and anything
 * beyond the cap waits in the queue until a visible toast dismisses — nothing
 * is ever dropped.
 */
export function pushToasts(
  visible: Achievement[],
  queue: Achievement[],
  incoming: Achievement[],
  maxVisible: number = MAX_VISIBLE_TOASTS,
): ToastQueue {
  const combined = [...queue, ...incoming];
  const room = Math.max(0, maxVisible - visible.length);
  return {
    visible: [...visible, ...combined.slice(0, room)],
    queue: combined.slice(room),
  };
}

/**
 * After one visible toast dismisses, pull the next queued toast into view if
 * there is room. `dismissed` should already have been removed from `visible`.
 */
export function pullNextToast(
  visible: Achievement[],
  queue: Achievement[],
  maxVisible: number = MAX_VISIBLE_TOASTS,
): ToastQueue {
  const room = Math.max(0, maxVisible - visible.length);
  return {
    visible: [...visible, ...queue.slice(0, room)],
    queue: queue.slice(room),
  };
}
