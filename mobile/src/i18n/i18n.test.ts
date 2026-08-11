import { en } from './en';
import { es } from './es';
import { ptBR } from './pt-BR';

/**
 * TypeScript already guarantees every locale has every key. What it can't see
 * is the *inside* of a string: a translation that drops or misspells
 * `{{name}}` renders a literal "{{name}}" to the user. One test covers it.
 */
const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

describe.each([
  ['es', es],
  ['pt-BR', ptBR],
])('%s translations', (_name, dict) => {
  it('uses exactly the placeholders English uses', () => {
    for (const [key, source] of Object.entries(en)) {
      expect({ key, ph: placeholders(dict[key as keyof typeof en]) }).toEqual({
        key,
        ph: placeholders(source),
      });
    }
  });
});
