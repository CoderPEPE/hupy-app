import { XP_PER_LEVEL, levelFromXp, tierForLevel, xpIntoLevel, xpToNextLevel } from './levels';

describe('levelFromXp', () => {
  it('starts at level 1 with zero XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('stays at level 1 until the first threshold', () => {
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelFromXp(50)).toBe(1);
  });

  it('crosses exactly at the threshold boundary', () => {
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2);
    expect(levelFromXp(XP_PER_LEVEL * 3)).toBe(4);
    expect(levelFromXp(XP_PER_LEVEL * 10)).toBe(11);
  });

  it('handles large XP without drifting', () => {
    expect(levelFromXp(100_000)).toBe(1001);
    expect(levelFromXp(100_099)).toBe(1001);
    expect(levelFromXp(100_100)).toBe(1002);
  });
});

describe('xpIntoLevel', () => {
  it('wraps XP within the current level', () => {
    expect(xpIntoLevel(0)).toBe(0);
    expect(xpIntoLevel(50)).toBe(50);
    expect(xpIntoLevel(149)).toBe(49);
    expect(xpIntoLevel(200)).toBe(0);
  });
});

describe('xpToNextLevel', () => {
  it('counts down the remaining XP', () => {
    expect(xpToNextLevel(0)).toBe(XP_PER_LEVEL);
    expect(xpToNextLevel(50)).toBe(50);
    expect(xpToNextLevel(199)).toBe(1);
    expect(xpToNextLevel(200)).toBe(XP_PER_LEVEL);
  });
});

describe('tierForLevel', () => {
  it('names tiers off the real level number, not the XP', () => {
    expect(tierForLevel(1)).toBe('beginner');
    expect(tierForLevel(2)).toBe('beginner');
    expect(tierForLevel(3)).toBe('elementary');
    expect(tierForLevel(5)).toBe('elementary');
    expect(tierForLevel(6)).toBe('intermediate');
    expect(tierForLevel(10)).toBe('intermediate');
    expect(tierForLevel(11)).toBe('advanced');
    expect(tierForLevel(99)).toBe('advanced');
  });
});
