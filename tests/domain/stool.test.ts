import { describe, expect, it } from 'vitest';
import { STOOL_COLORS, STOOL_GROUPS, stoolAlert } from '../../src/domain/stool';

describe('stool colors', () => {
  it('lists nine distinct colors with hex swatches', () => {
    expect(STOOL_COLORS).toHaveLength(9);
    expect(new Set(STOOL_COLORS.map((c) => c.id)).size).toBe(9);
    for (const c of STOOL_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('splits every colour into exactly one of the two groups', () => {
    const grouped = [...STOOL_GROUPS.usual, ...STOOL_GROUPS.doctor];
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(STOOL_COLORS.map((c) => c.id).sort());
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
