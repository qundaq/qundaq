import { describe, expect, it } from 'vitest';
import { BABY_COLORS, nextColor, resolveBabyColor } from '../../src/ui/babies/colors';

describe('resolveBabyColor', () => {
  it('maps a palette hex to its theme token and leaves an unknown hex alone', () => {
    expect(resolveBabyColor(BABY_COLORS[0].hex)).toBe('var(--baby-blue)');
    expect(resolveBabyColor('#FF9ECB')).toBe('var(--baby-pink)');
    expect(resolveBabyColor('#123456')).toBe('#123456');
  });
  it('nextColor still hands out palette hexes', () => {
    expect(BABY_COLORS.map((c) => c.hex)).toContain(nextColor([]));
  });
});
