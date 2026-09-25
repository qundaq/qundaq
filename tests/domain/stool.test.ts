import { describe, expect, it } from 'vitest';
import { STOOL_COLORS, stoolAlert } from '../../src/domain/stool';

describe('stool colors', () => {
  it('lists nine distinct colors with hex swatches', () => {
    expect(STOOL_COLORS).toHaveLength(9);
    expect(new Set(STOOL_COLORS.map((c) => c.id)).size).toBe(9);
    for (const c of STOOL_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each([
    ['white', 'pale'],
    ['pale-yellow', 'pale'],
    ['clay', 'pale'],
    ['red', 'blood'],
    ['black', 'black'],
    ['yellow', null],
    ['mustard', null],
    ['green', null],
    ['brown', null],
    [undefined, null],
  ] as const)('%s → %s', (color, alert) => {
    expect(stoolAlert(color)).toBe(alert);
  });
});
