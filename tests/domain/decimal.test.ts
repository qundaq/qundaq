import { describe, expect, it } from 'vitest';
import { parseDecimal, scaleToInt } from '../../src/domain/decimal';

describe('parseDecimal', () => {
  it.each([
    ['3,45', 3.45],
    ['3.45', 3.45],
    [' 38,2 ', 38.2],
    ['4', 4],
    ['0,5', 0.5],
  ] as const)('%j → %s', (raw, value) => {
    expect(parseDecimal(raw)).toBe(value);
  });

  it.each(['', ' ', '3,4,5', '3.4.5', ',5', '5,', '1e3', '0x10', '+5', '-1', 'Infinity', 'abc', '3 45'])('rejects %j', (raw) => {
    expect(parseDecimal(raw)).toBeNull();
  });
});

describe('scaleToInt', () => {
  it('rounds half up without binary floating-point surprises', () => {
    expect(scaleToInt(37.95, 10)).toBe(380); // 37.95 × 10 is 379.49999… in binary
    expect(scaleToInt(3.45, 1000)).toBe(3450);
    expect(scaleToInt(52.5, 10)).toBe(525);
    expect(scaleToInt(3.4565, 1000)).toBe(3457);
    expect(scaleToInt(38.24, 10)).toBe(382);
  });
});
