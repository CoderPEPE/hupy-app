import {
  FLOAT_MS,
  LEVEL_UP_TOP_UP_MS,
  MAX_FLOATS,
  fillAnimKind,
  levelUpFillSteps,
  pushXpFloat,
  shouldChimeXpGain,
  xpGain,
} from './xpFloat';

describe('xpGain', () => {
  it('baselines silently on first sight', () => {
    expect(xpGain(null, 250)).toBeNull();
  });

  it('ignores equal XP (a plain refetch)', () => {
    expect(xpGain(250, 250)).toBeNull();
  });

  it('ignores a decrease (XP reset is not a gain)', () => {
    expect(xpGain(250, 120)).toBeNull();
  });

  it('returns the positive delta', () => {
    expect(xpGain(250, 260)).toBe(10);
    expect(xpGain(0, 100)).toBe(100);
  });
});

describe('fillAnimKind', () => {
  it('fills quietly on first data sight (nothing seen being earned)', () => {
    expect(fillAnimKind(null, 230, 0, 30)).toBe('mount');
  });

  it('settles without celebration when XP stays flat or drops', () => {
    expect(fillAnimKind(230, 230, 30, 30)).toBe('drain');
    expect(fillAnimKind(230, 120, 30, 20)).toBe('drain');
  });

  it('recharges when a gain wraps the bar into a new level', () => {
    expect(fillAnimKind(95, 105, 95, 5)).toBe('levelup');
    expect(fillAnimKind(199, 201, 99, 1)).toBe('levelup');
  });

  it('syncs with the float on same-level gains', () => {
    expect(fillAnimKind(95, 96, 95, 96)).toBe('gain');
    expect(fillAnimKind(0, 50, 0, 50)).toBe('gain');
  });

  // A gain of exactly one level keeps the bar pct the same (0→0): no wrap,
  // so the bar has nothing visible to charge — the pill pulse + modal carry
  // that level-up. Documented so a future "fix" doesn't surprise anyone.
  it('classifies an invisible exact-boundary gain as a plain gain', () => {
    expect(fillAnimKind(0, 100, 0, 0)).toBe('gain');
  });
});

describe('levelUpFillSteps', () => {
  it('sums to exactly FLOAT_MS so the sweep lands with the float badge', () => {
    const steps = levelUpFillSteps();
    expect(steps.reduce((a, b) => a + b, 0)).toBe(FLOAT_MS);
  });

  it('completes the old bar, resets, then charges the new remainder', () => {
    const [topUp, reset, charge] = levelUpFillSteps();
    expect(topUp).toBe(LEVEL_UP_TOP_UP_MS);
    expect(reset).toBe(1);
    expect(charge).toBe(FLOAT_MS - LEVEL_UP_TOP_UP_MS - reset);
    expect(charge).toBeGreaterThan(0);
  });

  it('keeps the sum invariant for any sane float duration', () => {
    for (const ms of [1000, 2000, 3000]) {
      expect(levelUpFillSteps(ms).reduce((a, b) => a + b, 0)).toBe(ms);
    }
  });
});

describe('shouldChimeXpGain', () => {
  it('chimes for the first-ever gain sight', () => {
    expect(shouldChimeXpGain(null, 250)).toBe(true);
  });

  it('stays silent for the same total (already chimed — dedups mounted instances)', () => {
    expect(shouldChimeXpGain(250, 250)).toBe(false);
  });

  it('stays silent for a decrease (XP reset)', () => {
    expect(shouldChimeXpGain(250, 120)).toBe(false);
  });

  it('chimes exactly once per new total, app-wide', () => {
    expect(shouldChimeXpGain(250, 260)).toBe(true);
    expect(shouldChimeXpGain(260, 260)).toBe(false);
    expect(shouldChimeXpGain(260, 280)).toBe(true);
  });
});

describe('pushXpFloat', () => {
  it('keeps the stack newest-first', () => {
    const one = pushXpFloat([], { id: 1, amount: 10 });
    const two = pushXpFloat(one, { id: 2, amount: 5 });
    const three = pushXpFloat(two, { id: 3, amount: 7 });

    expect(three.map((f) => f.id)).toEqual([3, 2, 1]);
    expect(three.map((f) => f.amount)).toEqual([7, 5, 10]);
  });

  it('drops the oldest (last element) past the cap without reindexing the rest', () => {
    const three = [
      { id: 3, amount: 7 },
      { id: 2, amount: 5 },
      { id: 1, amount: 10 },
    ];
    const four = pushXpFloat(three, { id: 4, amount: 20 });

    // The oldest float (id 1) is evicted; ids 3 and 2 keep their order.
    expect(four.map((f) => f.id)).toEqual([4, 3, 2]);
    expect(four.length).toBe(MAX_FLOATS);
  });

  it('never grows past the cap regardless of batch size', () => {
    let floats = pushXpFloat([], { id: 1, amount: 1 });
    for (let id = 2; id <= 20; id++) {
      floats = pushXpFloat(floats, { id, amount: id });
    }
    expect(floats.length).toBe(MAX_FLOATS);
    expect(floats.map((f) => f.id)).toEqual([20, 19, 18]);
  });

  it('honors a maxFloats of 1 without exceeding the cap', () => {
    const floats = pushXpFloat([{ id: 1, amount: 1 }], { id: 2, amount: 2 }, 1);
    expect(floats).toEqual([{ id: 2, amount: 2 }]);
  });
});
