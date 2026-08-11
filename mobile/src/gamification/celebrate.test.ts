import type { Achievement } from '../api/gamification';
import { MAX_VISIBLE_TOASTS, decideCelebration, pullNextToast, pushToasts } from './celebrate';

/** Minimal fully-typed achievement factory. */
const ach = (code: string, earned = true): Achievement => ({
  code,
  title: code,
  description: '',
  icon: 'star',
  category: 'lessons',
  tier: 'bronze',
  xp_reward: 10,
  progress: 1,
  threshold: 1,
  earned_at: earned ? '2026-01-01T00:00:00Z' : null,
});

const codes = (items: { code: string }[]) => items.map((x) => x.code);

describe('decideCelebration — xpGained (the shared \"+N XP\" number)', () => {
  it('is null on first sight (nothing to state yet)', () => {
    const d = decideCelebration({ xp: 250, prevXp: null, achievements: [], lastLevel: null, seenCodes: [] });
    expect(d.xpGained).toBeNull();
  });

  it('is the real delta of the server total', () => {
    const d = decideCelebration({ xp: 260, prevXp: 240, achievements: [], lastLevel: 2, seenCodes: [] });
    expect(d.xpGained).toBe(20);
  });

  it('is null when XP went down (a reset is not a gain)', () => {
    const d = decideCelebration({ xp: 120, prevXp: 250, achievements: [], lastLevel: 5, seenCodes: [] });
    expect(d.xpGained).toBeNull();
    expect(d.levelUp).toBeNull();
  });
});

describe('decideCelebration — first sight', () => {
  it('adopts the current level silently (no level-up modal)', () => {
    const d = decideCelebration({ xp: 250, prevXp: null, achievements: [], lastLevel: null, seenCodes: [] });
    expect(d.firstSight).toBe(true);
    expect(d.levelUp).toBeNull();
    expect(d.nextLastLevel).toBe(3);
  });

  it('marks already-earned achievements as seen without toasting them', () => {
    const d = decideCelebration({
      xp: 0,
      prevXp: null,
      achievements: [ach('a'), ach('b', false)],
      lastLevel: null,
      seenCodes: [],
    });
    expect(d.freshAchievements).toEqual([]);
    expect(d.nextSeenCodes).toEqual(['a']);
  });
});

describe('decideCelebration — level transitions', () => {
  it('fires a level-up exactly when the threshold is crossed, carrying the gain', () => {
    const d = decideCelebration({ xp: 100, prevXp: 90, achievements: [], lastLevel: 1, seenCodes: [] });
    expect(d.levelUp).toEqual({ level: 2, xp: 100, xpGained: 10 });
  });

  it('reports the landing level and full gain for a multi-level jump', () => {
    const d = decideCelebration({ xp: 450, prevXp: 430, achievements: [], lastLevel: 2, seenCodes: [] });
    expect(d.levelUp).toEqual({ level: 5, xp: 450, xpGained: 20 });
  });

  it('stays quiet when the level is unchanged', () => {
    const d = decideCelebration({ xp: 310, prevXp: 310, achievements: [], lastLevel: 4, seenCodes: [] });
    expect(d.levelUp).toBeNull();
    expect(d.nextLastLevel).toBe(4);
  });

  it('re-baselines silently when the level drops (account reset)', () => {
    const d = decideCelebration({ xp: 120, prevXp: 250, achievements: [], lastLevel: 5, seenCodes: [] });
    expect(d.levelUp).toBeNull();
    expect(d.nextLastLevel).toBe(2);
  });
});

describe('decideCelebration — achievements', () => {
  it('toasts only earned achievements never seen before', () => {
    const d = decideCelebration({
      xp: 0,
      prevXp: 0,
      achievements: [ach('a'), ach('b'), ach('c', false)],
      lastLevel: 1,
      seenCodes: ['a'],
    });
    expect(codes(d.freshAchievements)).toEqual(['b']);
    expect(d.nextSeenCodes).toEqual(['a', 'b']);
  });

  it('keeps the same seenCodes reference when nothing new is earned', () => {
    const seen = ['a'];
    const d = decideCelebration({
      xp: 0,
      prevXp: 0,
      achievements: [ach('a')],
      lastLevel: 1,
      seenCodes: seen,
    });
    expect(d.nextSeenCodes).toBe(seen);
  });

  it('re-running with the persisted decision produces no further events', () => {
    // Simulates the component's effect running again after a refetch: storage
    // was already updated with the previous decision's next* values.
    const first = decideCelebration({
      xp: 260,
      prevXp: 240,
      achievements: [ach('new')],
      lastLevel: 2,
      seenCodes: [],
    });
    expect(first.levelUp?.level).toBe(3);
    expect(first.levelUp?.xpGained).toBe(20);
    expect(codes(first.freshAchievements)).toEqual(['new']);

    const second = decideCelebration({
      xp: 260,
      prevXp: 260,
      achievements: [ach('new')],
      lastLevel: first.nextLastLevel,
      seenCodes: first.nextSeenCodes,
    });
    expect(second.levelUp).toBeNull();
    expect(second.freshAchievements).toEqual([]);
    expect(second.xpGained).toBeNull();
  });
});

describe('pushToasts / pullNextToast — queue overflow', () => {
  it('caps the visible stack and queues the overflow', () => {
    expect(MAX_VISIBLE_TOASTS).toBe(2);
    const q = pushToasts([], [], [ach('a'), ach('b'), ach('c')]);
    expect(codes(q.visible)).toEqual(['a', 'b']);
    expect(codes(q.queue)).toEqual(['c']);
  });

  it('refills visible slots FIFO as toasts dismiss', () => {
    // Three arrive; only two fit.
    let q = pushToasts([], [], [ach('a'), ach('b'), ach('c')]);
    expect(codes(q.visible)).toEqual(['a', 'b']);

    // 'a' dismisses → the queued 'c' slides in.
    q = pullNextToast(q.visible.filter((x) => x.code !== 'a'), q.queue);
    expect(codes(q.visible)).toEqual(['b', 'c']);
    expect(q.queue).toEqual([]);

    // 'b' dismisses → nothing queued, one remains.
    q = pullNextToast(q.visible.filter((x) => x.code !== 'b'), q.queue);
    expect(codes(q.visible)).toEqual(['c']);
    expect(q.queue).toEqual([]);
  });

  it('does not displace existing toasts when the stack is already full', () => {
    const q = pushToasts([ach('a'), ach('b')], [], [ach('c'), ach('d')]);
    expect(codes(q.visible)).toEqual(['a', 'b']);
    expect(codes(q.queue)).toEqual(['c', 'd']);
  });

  it('leaves the stack unchanged when nothing is queued', () => {
    const q = pullNextToast([ach('a')], []);
    expect(codes(q.visible)).toEqual(['a']);
    expect(q.queue).toEqual([]);
  });
});
