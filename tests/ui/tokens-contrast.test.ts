import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');

/** The declarations of one selector block as a map of custom property → hex. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g))
    out[m[1]!] = m[2]!.toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

const FOREGROUNDS = ['--text', '--muted', '--primary', '--info', '--danger', '--live', '--ok'];
const BACKGROUNDS = ['--bg', '--surface', '--surface-2'];

describe('tokens.css contrast', () => {
  for (const [name, selector] of [
    ['dark', ':root {'],
    ['light', ":root[data-theme='light']"],
  ] as const) {
    it(`${name}: every foreground on every background is at least 4.5:1`, () => {
      const t = block(selector);
      for (const fg of FOREGROUNDS)
        for (const bg of BACKGROUNDS)
          expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['--on-primary']!, t['--primary']!), 'on-primary').toBeGreaterThanOrEqual(
        4.5,
      );
    });
    it(`${name}: baby colours are readable as a stripe (≥ 3:1 on surface)`, () => {
      const t = block(selector);
      for (const id of ['blue', 'pink', 'green', 'yellow', 'purple', 'orange'])
        expect(contrast(t[`--baby-${id}`]!, t['--surface']!), id).toBeGreaterThanOrEqual(3);
    });
  }
  it('night: text on its surfaces is at least 3:1 and primary text is readable', () => {
    const t = block(":root[data-night='true']");
    for (const bg of BACKGROUNDS)
      expect(contrast(t['--text']!, t[bg]!), bg).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--on-primary']!, t['--primary']!)).toBeGreaterThanOrEqual(4.5);
  });
});
