import type { User } from '../types';
import { apiRequest } from './client';

export type AuthResponse = {
  /** Short-lived access JWT. */
  token: string;
  /** Opaque rotating refresh token — single-use, exchanged at `/refresh`.
   * Snake_case because that is what the server sends; the client does not
   * transform response keys. */
  refresh_token: string;
  user: User;
};

/** The body of a successful `/api/auth/refresh` call. */
export type RefreshResponse = {
  token: string;
  refresh_token: string;
};

export function register(
  email: string,
  password: string,
  baseLanguage?: string,
  language?: string,
  name?: string,
) {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: { email, password, base_language: baseLanguage, language, name },
  });
}

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

/** Exchanges a Google ID token for a session, creating the account on first
 * sign-in. The course pair travels along and is only used for that first
 * sign-in — an existing account keeps the course it already has. */
export function googleLogin(idToken: string, baseLanguage?: string, language?: string) {
  return apiRequest<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: { id_token: idToken, base_language: baseLanguage, language },
  });
}

/** Exchanges an Apple identity token for a session, creating the account on
 * first sign-in. Apple only hands over the learner's name in that first
 * authorization, so it travels separately from the token. */
export function appleLogin(
  identityToken: string,
  name?: string,
  baseLanguage?: string,
  language?: string,
) {
  return apiRequest<AuthResponse>('/api/auth/apple', {
    method: 'POST',
    body: { identity_token: identityToken, name, base_language: baseLanguage, language },
  });
}

/** Reports the device's UTC offset so the daily streak is counted on the
 * learner's own calendar rather than UTC's. */
export function setTimezone(utcOffsetMinutes: number) {
  return apiRequest<User>('/api/auth/timezone', {
    method: 'POST',
    auth: true,
    body: { utc_offset_minutes: utcOffsetMinutes },
  });
}

/** Exchanges the stored refresh token for a fresh access JWT + next refresh
 * token. The presented token is single-use: this response is the only
 * successor. */
export function refresh(refreshToken: string) {
  return apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

/** Revokes the refresh token's whole login family server-side. Fire-and-
 * forget by design: local logout must never depend on the network. */
export function logout(refreshToken: string) {
  return apiRequest<void>('/api/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

/** Permanently erases the signed-in account and all its data. The server
 * cascades to progress, conversations, flashcards and tokens; there is no
 * undo. */
export function deleteAccount() {
  return apiRequest<void>('/api/auth/account', { method: 'DELETE', auth: true });
}

export function me() {
  return apiRequest<User>('/api/auth/me', { auth: true });
}

/** Switches the learner's course on the backend — the ordered (base, target)
 * pair of 'en' | 'es' | 'pt'. The base may be omitted to keep the current one. */
export function setLanguage(language: string, baseLanguage?: string) {
  return apiRequest<User>('/api/auth/language', {
    method: 'POST',
    auth: true,
    body: { language, base_language: baseLanguage },
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

/** Updates the learner's display name ('' falls back to the email-derived
 * name). Every greeting and the tutor's spoken address use it. */
export function setName(name: string) {
  return apiRequest<User>('/api/auth/name', {
    method: 'POST',
    auth: true,
    body: { name },
  });
}
