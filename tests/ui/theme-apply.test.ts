import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyThemeState,
  readStoredHint,
  writeStoredHint,
  THEME_COLORS,
} from '../../src/ui/app/theme';

function fakeDocument() {
  const dataset: Record<string, string> = {};
  const meta = { content: '' };
  const style: Record<string, string> = {};
  return {
    doc: {
      documentElement: { dataset, style },
      querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? meta : null),
    } as unknown as Document,
    dataset,
    meta,
    style,
  };
}

describe('applyThemeState', () => {
  it('sets the attributes, the meta colour and color-scheme for light', () => {
    const f = fakeDocument();
    applyThemeState(f.doc, { theme: 'light', night: false });
    expect(f.dataset).toEqual({ theme: 'light', night: 'false' });
    expect(f.meta.content).toBe(THEME_COLORS.light);
    expect(f.style.colorScheme).toBe('light');
  });
  it('night wins over light for the meta colour and color-scheme', () => {
    const f = fakeDocument();
    applyThemeState(f.doc, { theme: 'light', night: true });
    expect(f.dataset).toEqual({ theme: 'light', night: 'true' });
    expect(f.meta.content).toBe(THEME_COLORS.night);
    expect(f.style.colorScheme).toBe('dark');
  });
  it('survives a page without the meta tag', () => {
    const doc = {
      documentElement: { dataset: {}, style: {} },
      querySelector: () => null,
    } as unknown as Document;
    expect(() => applyThemeState(doc, { theme: 'dark', night: false })).not.toThrow();
  });
});

describe('stored hint', () => {
  it('reads, writes and tolerates a storage that throws', () => {
    const store = new Map<string, string>();
    writeStoredHint({ setItem: (k, v) => store.set(k, v) }, { theme: 'light', night: true });
    expect(readStoredHint({ getItem: (k) => store.get(k) ?? null })).toEqual({
      theme: 'light',
      night: true,
    });
    expect(readStoredHint(null)).toBeNull();
    expect(
      readStoredHint({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBeNull();
    expect(() =>
      writeStoredHint(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        { theme: 'dark', night: false },
      ),
    ).not.toThrow();
  });
});

/** The value of one custom property in one selector block of tokens.css. */
function tokenBg(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const match = /--bg\s*:\s*(#[0-9a-fA-F]{6})\s*;/.exec(body);
  expect(match, `--bg present in ${selector}`).not.toBeNull();
  return match![1]!.toLowerCase();
}

describe('theme colours do not drift from tokens.css or index.html', () => {
  const css = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('THEME_COLORS matches --bg for every theme block', () => {
    expect(tokenBg(css, ':root {')).toBe(THEME_COLORS.dark);
    expect(tokenBg(css, ":root[data-theme='light']")).toBe(THEME_COLORS.light);
    expect(tokenBg(css, ":root[data-night='true']")).toBe(THEME_COLORS.night);
  });

  it('index.html\'s static <meta name="theme-color"> matches the dark boot colour', () => {
    const match = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(html);
    expect(match, 'theme-color meta tag present').not.toBeNull();
    expect(match![1]!.toLowerCase()).toBe(THEME_COLORS.dark);
  });
});
