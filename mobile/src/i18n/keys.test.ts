import { en } from './en';
import { ptBR } from './pt-BR';
import { es } from './es';

// This test walks the source tree, which the app itself never does — so the
// node globals are declared here rather than pulling @types/node into a React
// Native project for the sake of one file.
declare const __dirname: string;
declare function require(id: string): {
  readdirSync(p: string): string[];
  readFileSync(p: string, enc: string): string;
  statSync(p: string): { isDirectory(): boolean };
  join(...parts: string[]): string;
};
const { readdirSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

/** Every `.ts`/`.tsx` file under src/, except the dictionaries themselves. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(path) || path.includes('/i18n/')) return [];
    return [path];
  });
}

/** Literal keys passed to `t('…')`. Keys assembled at runtime (`t(\`x.${y}\`)`)
 * are skipped — TypeScript cannot check those either, which is why
 * `translate` warns about them in dev. */
function literalKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]);
}

const SRC = join(__dirname, '..');

describe('translation keys', () => {
  /** The dev-time "[i18n] missing key" warning, caught at build time: any key
   * a screen asks for by name must exist in the source dictionary. */
  it('every key used in the app exists in en', () => {
    const missing = new Map<string, string[]>();
    for (const file of sourceFiles(SRC)) {
      for (const key of literalKeys(readFileSync(file, 'utf8'))) {
        if (!(key in en)) {
          missing.set(key, [...(missing.get(key) ?? []), file.replace(SRC, 'src')]);
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });

  /** TypeScript enforces this on the dictionary objects, but a value can still
   * be an empty string, which renders as a blank label rather than an error. */
  it.each([
    ['pt-BR', ptBR],
    ['es', es],
  ])('%s translates every key to something', (_locale, dict) => {
    const blank = Object.keys(en).filter((k) => !(dict as Record<string, string>)[k]?.trim());
    expect(blank).toEqual([]);
  });
});
