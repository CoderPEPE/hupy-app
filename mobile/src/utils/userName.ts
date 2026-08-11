import type { User } from '../types';

/** The name shown for a learner (profile header, chat greeting, voice-picker
 * preview): their stored real name when set, else the email local part — the
 * fallback for accounts created before the name field existed. The fallback
 * mirrors the backend's `display_name_from_email` rules (first segment,
 * stripped of separators, capitalized) so the tutor's spoken name and the
 * on-screen name always agree. Returns '' when nothing usable exists. */
export function displayName(user: User | null | undefined): string {
  const name = user?.name?.trim();
  if (name) return name;
  const local = user?.email.split('@')[0]?.trim() ?? '';
  const first = local.split(/[._\-+]/).find((part) => part.length > 0);
  const cleaned = first?.replace(/[^A-Za-z0-9]/g, '') ?? '';
  if (!cleaned) return '';
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}
