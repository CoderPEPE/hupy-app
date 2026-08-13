import { formatTime, indexForElapsed, unitStart } from './storyTiming';

const units = ['One two three four five.', 'Short.', 'A somewhat longer sentence with more words in it.'];

describe('story timing', () => {
  it('seeks to a boundary that maps back to the same unit', () => {
    // "Previous/next sentence" seeks to unitStart(i) — that position must map
    // back to unit i, or the transcript would show the neighbouring phrase.
    units.forEach((_, i) => {
      expect(indexForElapsed(units, unitStart(units, i))).toBe(i);
    });
  });

  it('clamps out-of-range positions to the first and last unit', () => {
    expect(indexForElapsed(units, -5)).toBe(0);
    expect(indexForElapsed(units, 99999)).toBe(units.length - 1);
    expect(unitStart(units, 0)).toBe(0);
    // Asking past the end stops at the total, it doesn't run off the array.
    expect(unitStart(units, 99)).toBe(unitStart(units, units.length));
  });

  it('formats the clock as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(272)).toBe('04:32');
    expect(formatTime(-5)).toBe('00:00');
  });
});
