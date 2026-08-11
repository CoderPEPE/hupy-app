import { TUTOR_VOICES } from './tutorVoices';

/**
 * The bundled catalog is only a fallback — the app renders GET /api/voices.
 * But a fallback that drifts from the DB is how "Ballad" ended up in the male
 * group while sounding female, so this pins the two copies together: same
 * ids, names, genders, pitches and order.
 */
// Declared locally: the app has no @types/node, and one test file isn't worth
// the dependency.
declare const __dirname: string;
declare function require(m: string): { readFileSync(p: string, enc: string): string };

const SEED = `${__dirname}/../../../backend/migrations/2026-08-11-000009_tutor_voices/up.sql`;

const seededVoices = () =>
  [
    ...require('fs')
      .readFileSync(SEED, 'utf8')
      .matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\w+)',\s*(\d+)\)/g),
  ].map(([, id, name, gender, pitch]) => ({ id, name, gender, pitch_hz: Number(pitch) }));

test('the bundled fallback catalog matches the seeded DB catalog', () => {
  const seeded = seededVoices();
  expect(seeded.length).toBe(10);
  expect(TUTOR_VOICES).toEqual(seeded);
});
