import type { Lesson, Planet, PlanetDetail } from '../types';
import { apiRequest } from './client';

export function getPlanets() {
  return apiRequest<Planet[]>('/api/planets', { auth: true });
}

export function getPlanet(id: string) {
  return apiRequest<PlanetDetail>(`/api/planets/${id}`, { auth: true });
}

export function getPlanetLesson(planetId: string) {
  return apiRequest<Lesson>(`/api/planets/${planetId}/lesson`, { auth: true });
}

export type ProgressMetric =
  | 'sentences'
  | 'pronunciation'
  | 'conversation'
  | 'listening'
  | 'flashcards'
  | 'review'
  | 'mastery';

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
