import { displayName } from './userName';
import type { User } from '../types';

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'ana@example.com',
  created_at: '2026-01-01T00:00:00Z',
  name: '',
  base_language: 'pt',
  language: 'en',
  voice: '',
  ...overrides,
});

describe('displayName', () => {
  it('prefers the stored real name', () => {
    expect(displayName(user({ name: '  Ana Paula  ' }))).toBe('Ana Paula');
  });

  it('falls back to the email local part, first segment, capitalized', () => {
    expect(displayName(user({ email: 'ana@example.com' }))).toBe('Ana');
    expect(displayName(user({ email: 'ana.paula@example.com' }))).toBe('Ana');
    expect(displayName(user({ email: 'joao_silva@example.com' }))).toBe('Joao');
    expect(displayName(user({ email: 'maria-luz@example.com' }))).toBe('Maria');
    expect(displayName(user({ email: 'bruno+tag@example.com' }))).toBe('Bruno');
  });

  it('strips non-alphanumeric characters from the local part', () => {
    expect(displayName(user({ email: 'a!b@example.com' }))).toBe('Ab');
  });

  it('returns empty string when nothing usable exists', () => {
    expect(displayName(user({ email: '' }))).toBe('');
    expect(displayName(user({ email: '@example.com' }))).toBe('');
    expect(displayName(user({ email: '..@example.com' }))).toBe('');
  });

  it('handles null and undefined users', () => {
    expect(displayName(null)).toBe('');
    expect(displayName(undefined)).toBe('');
  });

  it('treats a whitespace-only stored name as absent', () => {
    expect(displayName(user({ name: '   ' }))).toBe('Ana');
  });
});
