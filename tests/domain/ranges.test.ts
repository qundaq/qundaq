import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  MAX_RANGE_DAYS,
  customRange,
  isSingleDay,
  rangeDays,
  resolveRange,
  stepRange,
} from '../../src/domain/ranges';
import { addDays } from '../../src/domain/days';

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

describe('resolveRange', () => {
  const now = at(9, 25, 14, 30);

  it('defaults to today', () => {
    expect(DEFAULT_RANGE).toEqual({ kind: 'preset', preset: 'today' });
    expect(resolveRange(DEFAULT_RANGE, now)).toEqual({ from: at(9, 25), to: at(9, 26) });
  });

  it('resolves yesterday, the last 7 and the last 30 days ending today', () => {
    expect(resolveRange({ kind: 'preset', preset: 'yesterday' }, now)).toEqual({
      from: at(9, 24),
      to: at(9, 25),
    });
    const week = resolveRange({ kind: 'preset', preset: 'last7' }, now);
    expect(week).toEqual({ from: at(9, 19), to: at(9, 26) });
    expect(rangeDays(week)).toBe(7);
    const month = resolveRange({ kind: 'preset', preset: 'last30' }, now);
    expect(month).toEqual({ from: at(8, 27), to: at(9, 26) });
    expect(rangeDays(month)).toBe(30);
  });

  it('counts calendar days across a spring-forward and a fall-back change', () => {
    const spring = resolveRange({ kind: 'preset', preset: 'last7' }, at(3, 31, 10));
    expect(spring).toEqual({ from: at(3, 25), to: at(4, 1) });
    expect(rangeDays(spring)).toBe(7);
    const fall = resolveRange({ kind: 'preset', preset: 'last7' }, at(10, 27, 10));
    expect(fall).toEqual({ from: at(10, 21), to: at(10, 28) });
    expect(rangeDays(fall)).toBe(7);
    expect(rangeDays({ from: at(10, 25), to: at(10, 26) })).toBe(1);
    expect(rangeDays({ from: at(3, 29), to: at(3, 30) })).toBe(1);
  });

  it('resolves a custom range to its inclusive days', () => {
    expect(resolveRange({ kind: 'custom', from: at(9, 10), to: at(9, 12) }, now)).toEqual({
      from: at(9, 10),
      to: at(9, 13),
    });
  });
});

describe('isSingleDay', () => {
  it('is true for exactly one calendar day, including 23 h and 25 h days', () => {
    expect(isSingleDay({ from: at(9, 25), to: at(9, 26) })).toBe(true);
    expect(isSingleDay({ from: at(10, 25), to: at(10, 26) })).toBe(true);
    expect(isSingleDay({ from: at(9, 25), to: at(9, 27) })).toBe(false);
  });
});

describe('customRange', () => {
  const now = at(9, 25, 14);

  it('keeps a valid range, normalised to start of day', () => {
    expect(customRange(at(9, 10, 5), at(9, 12, 7), now)).toEqual({
      kind: 'custom',
      from: at(9, 10),
      to: at(9, 12),
    });
  });

  it('clamps a future end to today', () => {
    expect(customRange(at(9, 20), at(10, 5), now)).toEqual({
      kind: 'custom',
      from: at(9, 20),
      to: at(9, 25),
    });
  });

  it('clamps a start after the end to the end', () => {
    expect(customRange(at(9, 20), at(9, 12), now)).toEqual({
      kind: 'custom',
      from: at(9, 12),
      to: at(9, 12),
    });
    expect(customRange(at(10, 5), at(10, 9), now)).toEqual({
      kind: 'custom',
      from: at(9, 25),
      to: at(9, 25),
    });
  });

  it('limits the range to 366 days by moving the start forward', () => {
    const choice = customRange(at(1, 1) - 1000 * 86400000, at(9, 25), now);
    if (choice.kind !== 'custom') throw new Error('expected custom');
    expect(choice.to).toBe(at(9, 25));
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(rangeDays(resolveRange(choice, now))).toBe(366);
    expect(choice.from).toBe(addDays(at(9, 25), -365));
  });
});

describe('stepRange', () => {
  const now = at(9, 25, 14);

  it('steps a one-day range back and forward as a one-day custom range', () => {
    const today = resolveRange(DEFAULT_RANGE, now);
    expect(stepRange(today, -1, now)).toEqual({ kind: 'custom', from: at(9, 24), to: at(9, 24) });
    const yesterday = resolveRange({ kind: 'preset', preset: 'yesterday' }, now);
    expect(stepRange(yesterday, 1, now)).toEqual({
      kind: 'custom',
      from: at(9, 25),
      to: at(9, 25),
    });
  });

  it('never goes past today', () => {
    const today = resolveRange(DEFAULT_RANGE, now);
    expect(stepRange(today, 1, now)).toEqual({ kind: 'custom', from: at(9, 25), to: at(9, 25) });
  });

  it('steps across a DST change by calendar day', () => {
    expect(stepRange({ from: at(3, 30), to: at(3, 31) }, -1, at(4, 2))).toEqual({
      kind: 'custom',
      from: at(3, 29),
      to: at(3, 29),
    });
    expect(stepRange({ from: at(3, 29), to: at(3, 30) }, 1, at(4, 2))).toEqual({
      kind: 'custom',
      from: at(3, 30),
      to: at(3, 30),
    });
  });
});
