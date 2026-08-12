import type { PlanetStory, StoryListEntry } from '../types';
import { apiRequest } from './client';

/** The full story library: every planet of the user's course with its story
 * state (locked / unlocked / generated) — one request for the Audio tab. */
export function getStories() {
  return apiRequest<StoryListEntry[]>('/api/stories', { auth: true });
}

export function getStory(planetId: string) {
  return apiRequest<PlanetStory>(`/api/stories/${planetId}`, { auth: true });
}

/** Generates (or regenerates) the personalized story for a conquered planet. */
export function generateStory(planetId: string) {
  return apiRequest<PlanetStory>(`/api/stories/${planetId}/generate`, {
    method: 'POST',
    auth: true,
  });
}

/** Saves playback position so the player resumes where the learner stopped. */
export function saveStoryProgress(planetId: string, positionSecs: number, completed = false) {
  return apiRequest<PlanetStory>(`/api/stories/${planetId}/progress`, {
    method: 'POST',
    auth: true,
    body: { position_secs: positionSecs, completed },
  });
}
