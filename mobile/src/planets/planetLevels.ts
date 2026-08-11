import type { ImageSourcePropType } from 'react-native';
import type { Planet, PlanetDetail, PlanetLessonKind } from '../types';

/** Lesson path maps to four difficulty tiers (Learn → Master). */
export const PLANET_LEVELS = [
  { level: 1, kind: 'learn' as PlanetLessonKind, label: 'Learn' },
  { level: 2, kind: 'practice' as PlanetLessonKind, label: 'Practice' },
  { level: 3, kind: 'test' as PlanetLessonKind, label: 'Test' },
  { level: 4, kind: 'master' as PlanetLessonKind, label: 'Master' },
] as const;

export type PlanetVisualLevel = (typeof PLANET_LEVELS)[number]['level'];

const SLUG_BY_NUMBER: Record<number, string> = {
  1: 'mercury',
  2: 'venus',
  3: 'earth',
  4: 'mars',
  5: 'jupiter',
  6: 'saturn',
  7: 'uranus',
  8: 'neptune',
};

/**
 * Static requires for generated PNGs under assets/planets/{slug}/level-{1-4}.png
 * Regenerate with scripts/higgsfield-planet-prompts.sh after Higgsfield MCP is connected.
 */
const SOURCES: Partial<Record<number, Partial<Record<PlanetVisualLevel, ImageSourcePropType>>>> = {
  1: {
    1: require('../../assets/planets/mercury/level-1.png'),
    2: require('../../assets/planets/mercury/level-2.png'),
    3: require('../../assets/planets/mercury/level-3.png'),
    4: require('../../assets/planets/mercury/level-4.png'),
  },
  2: {
    1: require('../../assets/planets/venus/level-1.png'),
    2: require('../../assets/planets/venus/level-2.png'),
    3: require('../../assets/planets/venus/level-3.png'),
    4: require('../../assets/planets/venus/level-4.png'),
  },
  3: {
    1: require('../../assets/planets/earth/level-1.png'),
    2: require('../../assets/planets/earth/level-2.png'),
    3: require('../../assets/planets/earth/level-3.png'),
    4: require('../../assets/planets/earth/level-4.png'),
  },
  4: {
    1: require('../../assets/planets/mars/level-1.png'),
    2: require('../../assets/planets/mars/level-2.png'),
    3: require('../../assets/planets/mars/level-3.png'),
    4: require('../../assets/planets/mars/level-4.png'),
  },
  5: {
    1: require('../../assets/planets/jupiter/level-1.png'),
    2: require('../../assets/planets/jupiter/level-2.png'),
    3: require('../../assets/planets/jupiter/level-3.png'),
    4: require('../../assets/planets/jupiter/level-4.png'),
  },
  6: {
    1: require('../../assets/planets/saturn/level-1.png'),
    2: require('../../assets/planets/saturn/level-2.png'),
    3: require('../../assets/planets/saturn/level-3.png'),
    4: require('../../assets/planets/saturn/level-4.png'),
  },
  7: {
    1: require('../../assets/planets/uranus/level-1.png'),
    2: require('../../assets/planets/uranus/level-2.png'),
    3: require('../../assets/planets/uranus/level-3.png'),
    4: require('../../assets/planets/uranus/level-4.png'),
  },
  8: {
    1: require('../../assets/planets/neptune/level-1.png'),
    2: require('../../assets/planets/neptune/level-2.png'),
    3: require('../../assets/planets/neptune/level-3.png'),
    4: require('../../assets/planets/neptune/level-4.png'),
  },
};

export function planetSlug(number: number): string {
  return SLUG_BY_NUMBER[number] ?? `planet-${number}`;
}

export function planetImageSource(
  planetNumber: number,
  level: PlanetVisualLevel,
): ImageSourcePropType | null {
  return SOURCES[planetNumber]?.[level] ?? null;
}

/**
 * Pick the hero art tier from the planet's mastery. Mirrors the backend
 * lesson thresholds (learn 0.1, practice 0.25, test 0.45, master 0.8) so
 * the level works for every carousel item from the planets-list summary
 * alone — no per-planet detail fetch required.
 */
export function visualLevelForPlanet(planet: Planet, _detail?: PlanetDetail | undefined): PlanetVisualLevel {
  if (planet.status === 'locked') return 1;
  const m = planet.progress?.mastery ?? 0;
  if (m >= 0.45) return 4;
  if (m >= 0.25) return 3;
  if (m >= 0.1) return 2;
  return 1;
}

export function levelVisualStyle(level: PlanetVisualLevel, locked: boolean) {
  if (locked) {
    return { opacity: 0.35, glowScale: 0.9 };
  }
  switch (level) {
    case 1:
      return { opacity: 0.72, glowScale: 0.95 };
    case 2:
      return { opacity: 0.85, glowScale: 1 };
    case 3:
      return { opacity: 0.95, glowScale: 1.08 };
    case 4:
    default:
      return { opacity: 1, glowScale: 1.15 };
  }
}
