import { describe, expect, it } from 'vitest';
import { babyAge } from '../../src/domain/age';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('babyAge', () => {
  it('is unknown without a readable birth date or with one in the future', () => {
    expect(babyAge(undefined, at(2026, 9, 27))).toBeNull();
    expect(babyAge('', at(2026, 9, 27))).toBeNull();
    expect(babyAge('2026-02-31', at(2026, 9, 27))).toBeNull();
    expect(babyAge('27.09.2026', at(2026, 9, 27))).toBeNull();
    expect(babyAge('2026-09-28', at(2026, 9, 27))).toBeNull();
  });
  it('counts days up to 13, then weeks up to 11', () => {
    expect(babyAge('2026-09-27', at(2026, 9, 27))).toEqual({ unit: 'days', n: 0 });
    expect(babyAge('2026-09-14', at(2026, 9, 27))).toEqual({ unit: 'days', n: 13 });
    expect(babyAge('2026-09-13', at(2026, 9, 27))).toEqual({ unit: 'weeks', n: 2 });
    expect(babyAge('2026-07-06', at(2026, 9, 27))).toEqual({ unit: 'weeks', n: 11 }); // 83 days
  });
  it('switches to whole months at 12 weeks and to years at 24 months', () => {
    expect(babyAge('2026-07-05', at(2026, 9, 27))).toEqual({ unit: 'months', n: 2 }); // 84 days
    expect(babyAge('2025-10-28', at(2026, 9, 27))).toEqual({ unit: 'months', n: 10 });
    expect(babyAge('2024-09-28', at(2026, 9, 27))).toEqual({ unit: 'months', n: 23 });
    expect(babyAge('2024-09-27', at(2026, 9, 27))).toEqual({ unit: 'years', n: 2 });
  });
  it('is not thrown off by a daylight-saving change between birth and now', () => {
    expect(babyAge('2026-03-20', at(2026, 4, 2, 0))).toEqual({ unit: 'days', n: 13 });
  });
});
