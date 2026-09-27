import { describe, expect, it } from 'vitest';
import { AGO_MINUTES, NOW_CHOICE, resolveTimeChoice } from '../../src/domain/entryTime';
import { MINUTE } from '../../src/domain/time';

const NOW = new Date(2026, 8, 27, 3, 12, 45, 250).getTime();

describe('resolveTimeChoice', () => {
  it('"now" is the exact instant of saving, seconds and all', () => {
    expect(resolveTimeChoice(NOW_CHOICE, NOW)).toBe(NOW);
  });
  it('"N minutes ago" counts back from the instant of saving', () => {
    expect(AGO_MINUTES).toEqual([5, 15, 30]);
    expect(resolveTimeChoice({ kind: 'ago', minutes: 15 }, NOW)).toBe(NOW - 15 * MINUTE);
  });
  it('a picked date and time is used as it is', () => {
    const picked = new Date(2026, 8, 24, 21, 0).getTime();
    expect(resolveTimeChoice({ kind: 'picked', at: picked }, NOW)).toBe(picked);
  });
});
