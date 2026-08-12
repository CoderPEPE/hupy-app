import { useCallback } from 'react';
import { create } from 'zustand';
import { storage, StorageKeys } from '../storage';
import { en, type TranslationKey } from './en';
import { ptBR } from './pt-BR';
import { es } from './es';

export type Locale = 'en' | 'pt-BR' | 'es';
export type { TranslationKey };

const SUPPORTED_LOCALES: Locale[] = ['en', 'pt-BR', 'es'];

const dictionaries = { en, 'pt-BR': ptBR, es } as const;

/** BCP-47 tag to hand to `Intl`/`Date#toLocaleString` for the active locale. */
export function localeTag(locale: Locale): string {
  return locale === 'pt-BR' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US';
}

/** Best-effort device locale via Hermes' built-in Intl — no extra dependency.
 * A device language the app doesn't ship falls back to English. */
function detectLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    if (tag.toLowerCase().startsWith('pt')) return 'pt-BR';
    if (tag.toLowerCase().startsWith('es')) return 'es';
    return 'en';
  } catch {
    return 'en';
  }
}

function isLocale(value: string | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as string[]).includes(value);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

/** Imperative lookup for use outside React (stores, hooks with stale closures). */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  // Keys assembled at runtime escape TypeScript's check; say so in dev rather
  // than rendering the raw key to the user (e.g. "language.undefined").
  if (__DEV__ && !(key in dictionaries.en)) console.warn(`[i18n] missing key: ${key}`);
  const template = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  return interpolate(template, params);
}

/** Picks the right plural form key; en/es/pt-BR all use singular only for exactly 1. */
export function plural(count: number, one: TranslationKey, other: TranslationKey): TranslationKey {
  return count === 1 ? one : other;
}

/** UI locale for a course's base language, and back. The learner's own
 * language and the interface language are one concept — a Spanish speaker
 * gets a Spanish interface — so these two must never be derived separately. */
const LOCALE_BY_BASE: Record<string, Locale> = { en: 'en', es: 'es', pt: 'pt-BR' };

export function localeForBaseLanguage(base: string | undefined | null): Locale | undefined {
  return base ? LOCALE_BY_BASE[base] : undefined;
}

export function baseLanguageForLocale(locale: Locale): 'en' | 'es' | 'pt' {
  return locale === 'pt-BR' ? 'pt' : locale === 'es' ? 'es' : 'en';
}

const LANGUAGE_KEYS: Record<string, TranslationKey> = {
  en: 'language.en',
  es: 'language.es',
  pt: 'language.pt',
  'pt-BR': 'language.ptBR',
};

/**
 * The display-name key for a language code. Callers used to build this by
 * concatenation (`'language.' + user?.language`) behind an `as TranslationKey`
 * cast, which TypeScript cannot check — an undefined or unknown code rendered
 * the literal "language.undefined" on screen. Returns undefined instead, so
 * callers must decide what an unknown language looks like.
 */
export function languageKey(code: string | undefined | null): TranslationKey | undefined {
  return code ? LANGUAGE_KEYS[code] : undefined;
}

type I18nState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useI18nStore = create<I18nState>((set) => ({
  locale: isLocale(storage.getString(StorageKeys.locale)) ? (storage.getString(StorageKeys.locale) as Locale) : detectLocale(),
  setLocale: (locale) => {
    storage.set(StorageKeys.locale, locale);
    set({ locale });
  },
}));

/** `t(key, params)` bound to the current locale — re-renders when it changes. */
export function useT() {
  const locale = useI18nStore((s) => s.locale);
  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}
