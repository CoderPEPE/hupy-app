import type { TranslationKey } from '../i18n';

/** XP required per level. Deliberately flat — the level is the treadmill
 * reward, the tier is the meaningful rank, and the SRS schedule is what
 * actually gates learning. */
export const XP_PER_LEVEL = 100;

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** XP earned inside the current level, in [0, XP_PER_LEVEL). */
export function xpIntoLevel(xp: number): number {
  return xp % XP_PER_LEVEL;
}

/** XP still needed to reach the next level. */
export function xpToNextLevel(xp: number): number {
  return XP_PER_LEVEL - xpIntoLevel(xp);
}

export type LevelTier = 'beginner' | 'elementary' | 'intermediate' | 'advanced';

export function tierForLevel(level: number): LevelTier {
  if (level >= 11) return 'advanced';
  if (level >= 6) return 'intermediate';
  if (level >= 3) return 'elementary';
  return 'beginner';
}

/** i18n key for each tier's display name. A static union rather than a
 * string built at runtime, so the type checker catches a typo. */
export const TIER_KEYS: Record<LevelTier, TranslationKey> = {
  beginner: 'profile.tierBeginner',
  elementary: 'profile.tierElementary',
  intermediate: 'profile.tierIntermediate',
  advanced: 'profile.tierAdvanced',
};
