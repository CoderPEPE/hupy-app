// The i18n module reaches storage for the persisted locale, and MMKV is a
// native module with no presence in Jest — the mapping under test is pure.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({ getString: () => undefined, set: () => {}, remove: () => {} }),
}));

import { baseLanguageForLocale, localeForBaseLanguage } from './index';
import type { Locale } from './index';

/**
 * The interface language is derived from the learner's base language, never
 * chosen separately — three copies of that answer (device storage, the auth
 * store, the picker) once drifted apart and shipped an English UI to an
 * account whose course and achievements were Spanish.
 */
describe('locale <-> base language', () => {
  it('maps every course base language to a real locale', () => {
    expect(localeForBaseLanguage('en')).toBe('en');
    expect(localeForBaseLanguage('es')).toBe('es');
    expect(localeForBaseLanguage('pt')).toBe('pt-BR');
  });

  it('has no locale for an unknown or missing base language', () => {
    expect(localeForBaseLanguage(undefined)).toBeUndefined();
    expect(localeForBaseLanguage('')).toBeUndefined();
    expect(localeForBaseLanguage('fr')).toBeUndefined();
  });

  it('round-trips: a locale derived from a base maps back to it', () => {
    for (const base of ['en', 'es', 'pt'] as const) {
      expect(baseLanguageForLocale(localeForBaseLanguage(base) as Locale)).toBe(base);
    }
  });
});
