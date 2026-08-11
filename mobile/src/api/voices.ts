import type { TutorVoice } from '../voice/tutorVoices';
import { apiRequest } from './client';

/** The tutor voice catalog, served from the DB (`tutor_voices`) so a
 * relabeled or newly added voice needs no app release. Female group first,
 * each group ordered bright -> deep. */
export function getVoices() {
  return apiRequest<TutorVoice[]>('/api/voices', { auth: true });
}
