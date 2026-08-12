/**
 * Minimal ambient types for the `fs` module, used only by the i18n guard
 * test (src/i18n/i18n.test.ts) which scans the UI source for hardcoded
 * strings. The project's tsconfig includes only `jest` types — no
 * @types/node — so declare just the three functions we use instead of
 * pulling in all of Node's globals.
 *
 * Lives in its own .d.ts (not in the test file) because a module with
 * imports can only *augment* an existing module, and there is no 'fs' base
 * to augment here.
 */
declare module 'fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
  export function statSync(path: string): { isDirectory(): boolean };
}
