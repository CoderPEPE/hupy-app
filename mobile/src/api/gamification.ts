import { apiRequest } from './client';

export type Badge = {
  code: string;
  title: string;
  description: string;
  icon: string;
  earned_at: string;
};

export type GamificationStats = {
  xp: number;
  streak_days: number;
  longest_streak: number;
  badges: Badge[];
};

/** Streaks, XP, and badges — all server-computed from real learning events,
 * never client-settable, so there's nothing here for the app to fake. */
export function getGamificationStats() {
  return apiRequest<GamificationStats>('/api/gamification/stats', { auth: true });
}
