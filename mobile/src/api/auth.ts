import type { User } from '../types';
import { apiRequest } from './client';

export type AuthResponse = {
  token: string;
  user: User;
};

export function register(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: { email, password },
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
