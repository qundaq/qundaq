import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../../src/', import.meta.url).pathname;
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC);

describe('styling rules', () => {
  it('has exactly two global stylesheets; everything else is a CSS Module', () => {
    const css = files
      .filter((f) => f.endsWith('.css') && !f.endsWith('.module.css'))
      .map((f) => f.slice(SRC.length));
    expect(css.sort()).toEqual(['ui/styles/base.css', 'ui/styles/tokens.css']);
  });
  it('keeps colour literals out of components (tokens.css and the baby palette own them)', () => {
    const offenders = files
      .filter(
        (f) => (f.endsWith('.tsx') || f.endsWith('.module.css')) && !f.endsWith('babies/colors.ts'),
      )
      .filter((f) =>
        /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8').replace(/<path[^>]*>/g, '')),
      )
      .map((f) => f.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
  it('screens compose shared components instead of writing class names', () => {
    const offenders = files
      .filter(
        (f) =>
          f.endsWith('.tsx') &&
          f.includes('/ui/') &&
          !f.includes('/ui/shared/') &&
          !f.includes('/ui/app/'),
      )
      .filter((f) => /className=(["'`]|\{["'`])/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
