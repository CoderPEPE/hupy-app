import { apiRequest } from './client';

export type Badge = {
  code: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
};

/** One of the 100 achievements, with this learner's standing on it.
 * `earned_at` is null while locked; `progress`/`threshold` drive the bar. */
export type Achievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  xp_reward: number;
  progress: number;
  threshold: number;
  earned_at: string | null;
};

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementCategory =
  | 'lessons'
  | 'planets'
  | 'sentences'
  | 'cards'
  | 'conversation'
  | 'corrections'
  | 'streak'
  | 'xp';

export type GamificationStats = {
  xp: number;
  streak_days: number;
  longest_streak: number;
  badges: Badge[];
  achievements: Achievement[];
  earned_count: number;
  total_count: number;
};

/** Streaks, XP, and achievements — all server-computed from real learning
 * events, never client-settable, so there's nothing here for the app to fake. */
export function getGamificationStats() {
  return apiRequest<GamificationStats>('/api/gamification/stats', { auth: true });
}
