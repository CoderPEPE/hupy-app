import { useCallback } from 'react';
import { create } from 'zustand';
import { storage, StorageKeys } from '../storage';
import { en, type TranslationKey } from './en';
import { ptBR } from './pt-BR';

export type Locale = 'en' | 'pt-BR';
export type { TranslationKey };

const SUPPORTED_LOCALES: Locale[] = ['en', 'pt-BR'];

const dictionaries = { en, 'pt-BR': ptBR } as const;

/** BCP-47 tag to hand to `Intl`/`Date#toLocaleString` for the active locale. */
export function localeTag(locale: Locale): string {
  return locale === 'pt-BR' ? 'pt-BR' : 'en-US';
}

/** Best-effort device locale via Hermes' built-in Intl — no extra dependency. */
function detectLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    return tag.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
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
  const template = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  return interpolate(template, params);
}

/** Picks the right plural form key; en/pt-BR both use singular only for exactly 1. */
export function plural(count: number, one: TranslationKey, other: TranslationKey): TranslationKey {
  return count === 1 ? one : other;
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
