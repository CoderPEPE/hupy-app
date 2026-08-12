import {
  levelVisualStyle,
  planetImageSource,
  planetOrbSource,
  planetSlug,
  visualLevelForPlanet,
} from './planetLevels';
import type { Planet } from '../types';

const planet = (overrides: Partial<Planet> = {}): Planet => ({
  id: 'p1',
  number: 1,
  title: 'First Contacts',
  subtitle: 'greetings',
  color: '#4A44BE',
  topics: [],
  created_at: '2026-01-01T00:00:00Z',
  base_language: 'pt',
  language: 'en',
  status: 'in_progress',
  unlock_progress: 0,
  mastered_sentences: 0,
  total_sentences: 50,
  level: 'A1',
  goal: 'Introduce yourself',
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
  ...overrides,
});

describe('visualLevelForPlanet', () => {
  it('is always level 1 while locked, regardless of mastery', () => {
    expect(visualLevelForPlanet(planet({ status: 'locked', progress: { ...planet().progress, mastery: 0.9 } }))).toBe(1);
  });

  it('maps mastery to the backend lesson thresholds', () => {
    expect(visualLevelForPlanet(planet())).toBe(1);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.05 } }))).toBe(1);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.1 } }))).toBe(2);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.24 } }))).toBe(2);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.25 } }))).toBe(3);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.44 } }))).toBe(3);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 0.45 } }))).toBe(4);
    expect(visualLevelForPlanet(planet({ progress: { ...planet().progress, mastery: 1 } }))).toBe(4);
  });

  it('treats missing progress as zero mastery', () => {
    const { progress: _drop, ...withoutProgress } = planet();
    expect(visualLevelForPlanet(withoutProgress as Planet)).toBe(1);
  });
});

describe('levelVisualStyle', () => {
  it('dims locked planets', () => {
    expect(levelVisualStyle(4, true)).toEqual({ opacity: 0.35, glowScale: 0.9 });
  });

  it('grows brighter and larger with each level', () => {
    const levels = [1, 2, 3, 4] as const;
    const styles = levels.map((level) => levelVisualStyle(level, false));
    expect(styles.map((s) => s.opacity)).toEqual([0.72, 0.85, 0.95, 1]);
    expect(styles.map((s) => s.glowScale)).toEqual([0.95, 1, 1.08, 1.15]);
  });
});

describe('planetSlug', () => {
  it('names the eight solar-system planets', () => {
    expect(planetSlug(1)).toBe('mercury');
    expect(planetSlug(8)).toBe('neptune');
  });

  it('falls back to a generic slug beyond the catalog', () => {
    expect(planetSlug(9)).toBe('planet-9');
    expect(planetSlug(0)).toBe('planet-0');
  });
});

describe('planet art sources', () => {
  it('returns an orb for known planets and null otherwise', () => {
    expect(planetOrbSource(1)).not.toBeNull();
    expect(planetOrbSource(8)).not.toBeNull();
    expect(planetOrbSource(9)).toBeNull();
  });

  it('returns level art for known planet/level pairs only', () => {
    expect(planetImageSource(1, 4)).not.toBeNull();
    expect(planetImageSource(8, 1)).not.toBeNull();
    expect(planetImageSource(9, 1)).toBeNull();
    // An out-of-range level is not a valid PlanetVisualLevel at the type
    // level; assert the runtime fallback via an explicit cast.
    expect(planetImageSource(1, 5 as unknown as 1)).toBeNull();
  });
});
