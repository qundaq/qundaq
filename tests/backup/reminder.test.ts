import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { believable, daysSinceBackup } from '../../src/backup/reminder';

let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

describe('daysSinceBackup', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysSinceBackup(at(26, 7), at(26, 23))).toBe(0);
    expect(daysSinceBackup(at(25, 23, 50), at(26, 0, 10))).toBe(1);
    expect(daysSinceBackup(at(17, 21), at(26, 9))).toBe(9);
  });

  it('is never negative, even for a backup time in the future', () => {
    expect(daysSinceBackup(at(28, 9), at(26, 9))).toBe(0);
  });
});

describe('believable', () => {
  it('drops a time later than the limit, or one that is not finite', () => {
    expect(believable(5, 10)).toBe(5);
    expect(believable(10, 10)).toBe(10);
    expect(believable(11, 10)).toBeUndefined();
    expect(believable(Number.NaN, 10)).toBeUndefined();
    expect(believable(undefined, 10)).toBeUndefined();
  });
});
