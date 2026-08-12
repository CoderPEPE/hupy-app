import { readdirSync, readFileSync, statSync } from 'fs';
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

/**
 * TypeScript guarantees every locale implements every key, and every `t()`
 * call is checked against the key union — but neither catches a literal
 * string written straight into a prop, which silently shows one language to
 * speakers of the other two. This scans the UI source for the highest-signal
 * offenders and fails the suite if one appears. (It guards the exact bug this
 * file once missed: SocialAuthRow shipped `accessibilityLabel={`Continue with
 * ${p}`}` — a template literal, so the guard must match backticks, not just
 * quotes.)
 */
// Deliberate scope: every JSX-bearing directory today. `src/navigation`
// renders tab labels but only through t(labelKey); if a new directory starts
// rendering JSX, add it here. Known blind spot of the line-regex: a ternary
// whose condition name opens the braces (`{playing ? "Play" : "Pause"}`)
// starts with the variable, not a quote — catching that would flag every
// t('key') call, so it stays out of scope.
const UI_DIRS = ['src/screens', 'src/components'];

function uiSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = dir + '/' + entry;
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full);
    }
  };
  for (const dir of UI_DIRS) walk(dir);
  return out;
}

// A literal value on these props is always a bug: screen-reader labels,
// headings and field hints have no business being hardcoded in one language.
// JSX writes those literals three ways — `prop="..."`, `prop='...'` and
// `prop={`... ${x}`}` (a template inside braces, which is how the original
// bug was written) — so the optional `{` is required to catch the last one.
// Requires a leading letter so technical values like placeholder="—" (the
// Dropdown em-dash default) never match, and so `{t('...')}` / `{orbLabel}`
// expressions (which start with a name, not a quote) stay clear.
const HARDCODED_PROP =
  /(accessibilityLabel|title|subtitle|placeholder|label|message|buttonText)\s*=\s*(?:\{\s*)?[`"'][A-Za-z]/;

describe('no hardcoded UI strings', () => {
  it('flags every literal accessibilityLabel/title/placeholder in the UI source', () => {
    const offenders: string[] = [];
    for (const file of uiSourceFiles()) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (HARDCODED_PROP.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
