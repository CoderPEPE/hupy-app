import { groupByPhase, journeyWindow, phaseFor, PHASES } from './phases';
import type { Planet, PlanetStatus } from '../types';

const planet = (number: number, status: PlanetStatus): Planet => ({
  id: `p${number}`,
  number,
  title: `Planet ${number}`,
  subtitle: '',
  color: '#4A44BE',
  topics: [],
  created_at: '2026-01-01T00:00:00Z',
  base_language: 'pt',
  language: 'en',
  status,
  unlock_progress: 0,
  mastered_sentences: 0,
  total_sentences: 50,
  level: 'A1',
  goal: '',
  completed_blocks: 0,
  total_blocks: 10,
  review_skills: [],
  progress: {
    sentences: 0,
    pronunciation: 0,
    conversation: 0,
    listening: 0,
    flashcards: 0,
    review: 0,
    mastery: 0,
  },
});

/** A 60-planet course where the first `conquered` planets are done. */
const course = (conquered: number): Planet[] =>
  Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    if (n <= conquered) return planet(n, 'conquered');
    if (n === conquered + 1) return planet(n, 'in_progress');
    return planet(n, 'locked');
  });

describe('phaseFor', () => {
  it('maps each planet to its phase of the journey', () => {
    expect(phaseFor(1).key).toBe('foundations');
    expect(phaseFor(10).key).toBe('foundations');
    expect(phaseFor(11).key).toBe('basic');
    expect(phaseFor(30).key).toBe('independence');
    expect(phaseFor(31).key).toBe('fluency');
    expect(phaseFor(50).key).toBe('advanced');
    expect(phaseFor(60).key).toBe('mastery');
  });

  it('covers all 60 planets with no gap or overlap', () => {
    expect(PHASES).toHaveLength(6);
    for (let n = 1; n <= 60; n++) {
      const matches = PHASES.filter((p) => n >= p.first && n <= p.last);
      expect(matches).toHaveLength(1);
    }
  });
});

describe('groupByPhase', () => {
  it('splits the full course into its six phases', () => {
    const groups = groupByPhase(course(0));
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.planets.length)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('drops phases the learner has no planets in', () => {
    const groups = groupByPhase(course(0).slice(0, 12));
    expect(groups.map((g) => g.phase.key)).toEqual(['foundations', 'basic']);
  });
});

describe('journeyWindow', () => {
  it('centres on the planet the learner is actually on', () => {
    const window = journeyWindow(course(7));
    // Planet 8 is in progress: two behind, four ahead.
    expect(window.map((p) => p.number)).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it('does not run off the start of the journey', () => {
    const window = journeyWindow(course(0));
    expect(window[0].number).toBe(1);
    expect(window).toHaveLength(5); // planet 1 + four ahead
  });

  it('shows the tail once every planet is conquered', () => {
    const window = journeyWindow(course(60));
    expect(window.map((p) => p.number)).toEqual([58, 59, 60]);
  });

  /// A planet awaiting review is still where the learner is — the window must
  /// not skip past it to the next unlocked planet.
  it('anchors on a planet that needs review', () => {
    const planets = course(60).map((p) => (p.number === 4 ? planet(4, 'review') : p));
    expect(journeyWindow(planets)[0].number).toBe(2);
    expect(journeyWindow(planets).map((p) => p.number)).toContain(4);
  });

  it('handles an empty course', () => {
    expect(journeyWindow([])).toEqual([]);
  });
});
