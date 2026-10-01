import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addDays,
  dayOffset,
  dayWindow,
  fromDateInputValue,
  hourOf,
  overlapMs,
  resolveDay,
  startOfDay,
  stepDay,
  toDateInputValue,
} from '../../src/domain/days';
import { HOUR, MINUTE } from '../../src/domain/time';

// Europe/Berlin has a 23-hour day on 2026-03-29 and a 25-hour day on 2026-10-25.
let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const at = (month: number, day: number, hour = 0, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime();

describe('calendar days', () => {
  it('startOfDay is local midnight', () => {
    expect(startOfDay(at(9, 25, 14, 30))).toBe(at(9, 25));
  });

  it('a spring-forward day has 23 hours and a fall-back day 25', () => {
    expect(addDays(at(3, 29), 1) - at(3, 29)).toBe(23 * HOUR);
    expect(addDays(at(10, 25), 1) - at(10, 25)).toBe(25 * HOUR);
    expect(dayWindow(at(10, 25, 12))).toEqual({ from: at(10, 25), to: at(10, 26) });
  });

  it('addDays also goes back, across month ends and DST', () => {
    expect(addDays(at(10, 1), -1)).toBe(at(9, 30));
    expect(addDays(at(3, 30), -1)).toBe(at(3, 29));
    expect(addDays(at(10, 26), -7)).toBe(at(10, 19));
  });

  it('dayOffset counts calendar days, whatever their length', () => {
    expect(dayOffset(at(10, 25), at(10, 25, 23, 59))).toBe(0);
    expect(dayOffset(at(10, 26), at(10, 25, 22))).toBe(-1);
    expect(dayOffset(at(10, 24), at(10, 26, 1))).toBe(2);
    expect(dayOffset(at(3, 28), at(3, 30, 1))).toBe(2);
  });

  it('overlapMs clips to the window and is never negative', () => {
    expect(overlapMs(at(9, 24, 23), at(9, 25, 2), at(9, 25), at(9, 26))).toBe(2 * HOUR);
    expect(overlapMs(at(9, 24, 20), at(9, 24, 21), at(9, 25), at(9, 26))).toBe(0);
    expect(overlapMs(at(9, 25, 8), at(9, 25, 8, 30), at(9, 25), at(9, 26))).toBe(30 * MINUTE);
  });
});

describe('the shown day', () => {
  const now = () => at(9, 25, 10);

  it('null means today, and a day after today shows today', () => {
    expect(resolveDay(null, now())).toBe(at(9, 25));
    expect(resolveDay(at(9, 20), now())).toBe(at(9, 20));
    expect(resolveDay(at(9, 28), now())).toBe(at(9, 25));
  });

  it('stepping back gives a day; stepping forward onto today gives null', () => {
    expect(stepDay(null, now(), -1)).toBe(at(9, 24));
    expect(stepDay(at(9, 24), now(), 1)).toBeNull();
    expect(stepDay(at(9, 20), now(), 1)).toBe(at(9, 21));
    expect(stepDay(null, now(), 1)).toBeNull();
  });
});

describe('date input values', () => {
  it('round-trips a local day', () => {
    expect(toDateInputValue(at(9, 5, 17))).toBe('2026-09-05');
    expect(fromDateInputValue('2026-09-05')).toBe(at(9, 5));
  });

  it('rejects empty and impossible dates', () => {
    expect(fromDateInputValue('')).toBeNull();
    expect(fromDateInputValue('2026-02-31')).toBeNull();
    expect(fromDateInputValue('2026-13-01')).toBeNull();
    expect(fromDateInputValue('yesterday')).toBeNull();
  });
});

describe('hourOf', () => {
  it('gives the local hour, 0-23', () => {
    expect(hourOf(new Date(2026, 8, 27, 0, 0).getTime())).toBe(0);
    expect(hourOf(new Date(2026, 8, 27, 9, 59).getTime())).toBe(9);
    expect(hourOf(new Date(2026, 8, 27, 23, 0).getTime())).toBe(23);
  });
});
