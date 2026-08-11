import type { User } from '../types';
import { apiRequest } from './client';

export type AuthResponse = {
  token: string;
  user: User;
};

export function register(email: string, password: string, language?: string) {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: { email, password, language },
  });
}

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function me() {
  return apiRequest<User>('/api/auth/me', { auth: true });
}

/** Switches the learner's course on the backend ('en' | 'es' | 'pt'). */
export function setLanguage(language: string) {
  return apiRequest<User>('/api/auth/language', {
    method: 'POST',
    auth: true,
    body: { language },
  });
}

/** Picks the tutor's voice (an OpenAI voice id; '' resets to the course
 * default). The next Realtime session and TTS previews speak with it. */
export function setVoice(voice: string) {
  return apiRequest<User>('/api/auth/voice', {
    method: 'POST',
    auth: true,
    body: { voice },
  });
}
