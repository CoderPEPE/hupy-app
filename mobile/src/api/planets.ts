import type { Lesson, Planet, PlanetDetail } from '../types';
import { apiRequest } from './client';

export function getPlanets() {
  return apiRequest<Planet[]>('/api/planets', { auth: true });
}

/** How much content one course contains. Public (no auth) so the pre-login
 * screens can state real figures instead of marketing claims; the (base,
 * target) pair picks which course to count. */
export type CatalogStats = { planets: number; sentences: number; lessons: number };

export function getCatalogStats(baseLanguage = 'pt', language = 'en') {
  return apiRequest<CatalogStats>(
    `/api/planets/catalog?base_language=${baseLanguage}&language=${language}`,
  );
}

export function getPlanet(id: string) {
  return apiRequest<PlanetDetail>(`/api/planets/${id}`, { auth: true });
}

export function getPlanetLesson(planetId: string) {
  return apiRequest<Lesson>(`/api/planets/${planetId}/lesson`, { auth: true });
}

/**
 * The metrics `POST /planets/:id/progress` actually accepts — the tutor's
 * qualitative judgment calls. Anything else is rejected server-side with a
 * 400 (see BUMPABLE_METRICS in the backend).
 *
 * Deliberately excludes `sentences` and `flashcards` (derived from real
 * counts via master_sentence / flashcard review) and `mastery` (always the
 * computed average of the six sub-metrics, never written directly — an
 * earlier build allowed it and left accounts showing progress for lessons
 * they'd never done).
 */
export type ProgressMetric = 'pronunciation' | 'conversation' | 'listening' | 'review';

/** Bumps one progress metric (clamped to 0..1 server-side) and returns the updated planet. */
export function bumpPlanetProgress(planetId: string, metric: ProgressMetric, delta: number) {
  return apiRequest<Planet>(`/api/planets/${planetId}/progress`, {
    method: 'POST',
    auth: true,
    body: { metric, delta },
  });
}

export function masterSentence(planetId: string, sentenceId: string, mastered: boolean) {
  return apiRequest<{ sentence_id: string; mastered: boolean; mastered_sentences: number; total_sentences: number }>(
    `/api/planets/${planetId}/sentences/${sentenceId}/master`,
    { method: 'POST', auth: true, body: { mastered } },
  );
}
