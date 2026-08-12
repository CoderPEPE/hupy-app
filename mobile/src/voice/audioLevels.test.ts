import { audioLevels, normalizeLevel } from './audioLevels';

describe('normalizeLevel', () => {
  it('maps 0 to 0 and full-scale to 1', () => {
    expect(normalizeLevel(0)).toBe(0);
    expect(normalizeLevel(0.25)).toBe(1);
    expect(normalizeLevel(1)).toBe(1);
  });

  it('clamps out-of-range input', () => {
    expect(normalizeLevel(-0.5)).toBe(0);
    expect(normalizeLevel(2)).toBe(1);
  });

  it('applies the sqrt curve so quiet speech stays visible', () => {
    // 0.25 * 0.25 = 0.0625 RMS -> sqrt(0.25) = 0.5 displayed.
    expect(normalizeLevel(0.0625)).toBeCloseTo(0.5);
    // Half the linear range displays at ~0.71 — a gentle lift for quiet audio.
    expect(normalizeLevel(0.125)).toBeCloseTo(Math.sqrt(0.5));
  });
});

describe('audioLevels bus', () => {
  // The bus is a per-file singleton; every test unsubscribes what it registers.

  it('publishes normalized levels to subscribers', () => {
    const seen: { level: number; source: 'mic' | 'playback' }[] = [];
    const unsub = audioLevels.subscribe((level, source) => seen.push({ level, source }));

    audioLevels.publish(0.25, 'mic');
    audioLevels.publish(0.0625, 'playback');

    expect(seen).toEqual([
      { level: 1, source: 'mic' },
      { level: 0.5, source: 'playback' },
    ]);
    unsub();
  });

  it('delivers to every subscriber', () => {
    const a: number[] = [];
    const b: number[] = [];
    const ua = audioLevels.subscribe((l) => a.push(l));
    const ub = audioLevels.subscribe((l) => b.push(l));

    audioLevels.publish(0.25, 'mic');
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
    ua();
    ub();
  });

  it('stops delivering after unsubscribe', () => {
    const seen: number[] = [];
    const unsub = audioLevels.subscribe((l) => seen.push(l));
    unsub();
    audioLevels.publish(0.25, 'mic');
    expect(seen).toEqual([]);
  });

  it('is a no-op with no subscribers', () => {
    // Must not throw; also nothing to observe.
    expect(() => audioLevels.publish(0.1, 'playback')).not.toThrow();
  });
});
