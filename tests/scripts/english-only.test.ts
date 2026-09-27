import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { tr } from '../../src/i18n/tr';

// Turkish-only letters. Any of them in code means a Turkish word slipped in; the dictionaries are
// the only home. Written as \u escapes, not the literal letters, so this file does not itself trip
// the check it defines.
const TURKISH = '[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]';
const DICTIONARIES = ['src/i18n/tr.ts', 'src/i18n/en.ts'];

describe('English-only code', () => {
  it('keeps Turkish text in the i18n dictionaries only', () => {
    let hits = '';
    try {
      hits = execFileSync(
        'git',
        [
          'grep',
          '-nIP',
          TURKISH,
          '--',
          'src',
          'tests',
          'e2e',
          ...DICTIONARIES.map((file) => `:!${file}`),
        ],
        { encoding: 'utf8' },
      );
    } catch (error) {
      // git grep exits 1 when nothing matches: that is the passing case.
      if ((error as { status?: number }).status !== 1) throw error;
    }
    expect(hits).toBe('');
  });

  it('keeps dictionary text out of the rest of the code, even where it holds no Turkish letter', () => {
    // Every Turkish value that reads differently from its English counterpart (a real piece of UI text,
    // not a shared symbol or number), long enough to not be noise, with no `{var}` placeholder to worry
    // matching around.
    const targets = new Set<string>();
    for (const key of Object.keys(tr) as (keyof typeof tr)[]) {
      const value = tr[key].trim();
      if (value.length < 3 || value.includes('{') || value === en[key]) continue;
      targets.add(value);
    }

    const files = execFileSync('git', ['ls-files', '--', 'src', 'tests', 'e2e'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(
        (file) =>
          /\.(ts|tsx|js|mjs|css)$/.test(file) &&
          file !== 'src/i18n/tr.ts' &&
          file !== 'src/i18n/en.ts',
      );

    // One regex pass per file collects every quoted literal's contents; each is then a single Set lookup,
    // rather than re-scanning the file once per dictionary value.
    const LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lineStarts = [0];
      for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
      const lineOf = (index: number) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (lineStarts[mid]! <= index) lo = mid;
          else hi = mid - 1;
        }
        return lo + 1;
      };
      for (const match of text.matchAll(LITERAL)) {
        const literal = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (targets.has(literal)) hits.push(`${file}:${lineOf(match.index)}: ${literal}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
