import type { Planet } from '../types';

/**
 * The six phases of the 60-planet journey (spec §2 "Divisão dos 60 planetas").
 * Ten planets each, A1 → C1. The Planets tab groups by these so a 60-row list
 * reads as a journey with milestones instead of an undifferentiated scroll.
 */
export const PHASES = [
  { key: 'foundations', first: 1, last: 10, level: 'A1' },
  { key: 'basic', first: 11, last: 20, level: 'A2' },
  { key: 'independence', first: 21, last: 30, level: 'B1' },
  { key: 'fluency', first: 31, last: 40, level: 'B2' },
  { key: 'advanced', first: 41, last: 50, level: 'B2+' },
  { key: 'mastery', first: 51, last: 60, level: 'C1' },
] as const;

export type Phase = (typeof PHASES)[number];

export function phaseFor(planetNumber: number): Phase {
  return PHASES.find((p) => planetNumber >= p.first && planetNumber <= p.last) ?? PHASES[0];
}

/** Planets grouped into their phase, phases with no planets dropped. */
export function groupByPhase(planets: Planet[]): { phase: Phase; planets: Planet[] }[] {
  return PHASES.map((phase) => ({
    phase,
    planets: planets.filter((p) => p.number >= phase.first && p.number <= phase.last),
  })).filter((g) => g.planets.length > 0);
}

/**
 * The focused slice of the journey: what the learner just finished, where
 * they are, and what comes next — the spec's "priorizar planetas recentemente
 * conquistados, planeta atual e próximos planetas, com opção de mapa
 * completo". Showing all 60 at once is the opt-in "full map" view.
 */
export function journeyWindow(planets: Planet[], behind = 2, ahead = 4): Planet[] {
  if (planets.length === 0) return [];
  const currentIndex = planets.findIndex(
    (p) => p.status !== 'conquered' && p.status !== 'mastered' && p.status !== 'locked',
  );
  // Every planet conquered: show the tail of the journey rather than nothing.
  const anchor = currentIndex >= 0 ? currentIndex : planets.length - 1;
  return planets.slice(Math.max(0, anchor - behind), anchor + ahead + 1);
}
