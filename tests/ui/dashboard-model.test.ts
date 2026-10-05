import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from '../../src/domain/time';
import { translate, type MessageKey } from '../../src/i18n';
import { dailyTotals, pumpReport } from '../../src/domain/summary';
import type { TrackerEvent } from '../../src/domain/types';
import {
  bottleTile,
  breastMinutes,
  breastfeedTile,
  formatTileValue,
  niceCeiling,
  pumpChartSeries,
  tileDiffText,
  weekAxis,
} from '../../src/ui/summary/dashboardModel';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);

describe('tileDiffText', () => {
  it('is null when both days are exactly zero: nothing to compare', () => {
    expect(tileDiffText(t, 'count', 0, 0)).toBeNull();
    expect(tileDiffText(t, 'duration', 0, 0)).toBeNull();
    expect(tileDiffText(t, 'ml', 0, 0)).toBeNull();
  });

  it('says "the same" when equal and non-zero', () => {
    expect(tileDiffText(t, 'count', 6, 6)).toBe(
      t('summary.diff.same.count', { value: formatTileValue(t, 'count', 6) }),
    );
    expect(tileDiffText(t, 'ml', 90, 90)).toBe(
      t('summary.diff.same.ml', { value: formatTileValue(t, 'ml', 90) }),
    );
    expect(tileDiffText(t, 'duration', 40 * MINUTE, 40 * MINUTE)).toBe(
      t('summary.diff.same.duration', { value: formatTileValue(t, 'duration', 40 * MINUTE) }),
    );
  });

  it('reads the absolute difference with a sign, per kind', () => {
    expect(tileDiffText(t, 'count', 7, 6)).toBe(
      t('summary.diff.count', { sign: '+', value: formatTileValue(t, 'count', 1) }),
    );
    expect(tileDiffText(t, 'count', 5, 6)).toBe(
      t('summary.diff.count', { sign: '−', value: formatTileValue(t, 'count', 1) }),
    );
    expect(tileDiffText(t, 'ml', 60, 120)).toBe(
      t('summary.diff.ml', { sign: '−', value: formatTileValue(t, 'ml', 60) }),
    );
    expect(tileDiffText(t, 'duration', HOUR + 40 * MINUTE, HOUR)).toBe(
      t('summary.diff.duration', { sign: '+', value: formatTileValue(t, 'duration', 40 * MINUTE) }),
    );
  });

  it('is a full diff, not "the same", when one day is zero and the other is not', () => {
    expect(tileDiffText(t, 'count', 5, 0)).toBe(
      t('summary.diff.count', { sign: '+', value: formatTileValue(t, 'count', 5) }),
    );
    expect(tileDiffText(t, 'count', 0, 5)).toBe(
      t('summary.diff.count', { sign: '−', value: formatTileValue(t, 'count', 5) }),
    );
  });
});

describe('niceCeiling', () => {
  it('rounds up to the smallest 1/2/5 × 10ⁿ step at or above the value', () => {
    expect(niceCeiling(0)).toBe(0);
    expect(niceCeiling(1)).toBe(1);
    expect(niceCeiling(13)).toBe(20);
    expect(niceCeiling(37)).toBe(50);
    expect(niceCeiling(45)).toBe(50);
    expect(niceCeiling(88)).toBe(100);
    expect(niceCeiling(120)).toBe(200);
    expect(niceCeiling(121)).toBe(200);
  });
});

describe('weekAxis', () => {
  it('is null when every value is zero: no axis to draw', () => {
    expect(weekAxis([0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('gives three ticks at zero, half the nice ceiling of the max, and the ceiling', () => {
    // max is 40; niceCeiling(40) = 50 (10 and 20 are both below 40, 50 is the first step at or above it).
    // The chart spaces its three ticks evenly (bottom/middle/top), so the middle one is exactly half.
    expect(weekAxis([10, 40, 0, 25, 13, 5, 30])).toEqual([0, 25, 50]);
  });
});

describe('pumpChartSeries', () => {
  const D = new Date(2026, 8, 25).getTime();
  const days = [0, 1, 2].map((i) => D + i * 24 * HOUR);
  const pump = (startAt: number, amounts: Partial<Record<string, number>>, end = true) =>
    ({
      id: String(startAt) + JSON.stringify(amounts),
      type: 'pump',
      babyId: null,
      startAt,
      ...(end ? { endAt: startAt } : { side: 'L' }),
      ...amounts,
      createdAt: 0,
      updatedAt: 0,
    }) as TrackerEvent;
  const series = (events: TrackerEvent[]) => pumpChartSeries(pumpReport(events, D, D + 72 * HOUR));

  it('plots minutes per day when any pump of the window has minutes, even beside ml-only days', () => {
    expect(
      series([
        pump(D + 9 * HOUR, { minLeft: 20, minRight: 15, mlLeft: 80 }),
        pump(D + 33 * HOUR, { mlLeft: 120 }),
      ]),
    ).toEqual({
      unit: 'min',
      days: [
        { day: days[0], value: 35 },
        { day: days[1], value: 0 },
        { day: days[2], value: 0 },
      ],
    });
  });

  it('plots the ml per day when the window has ml only', () => {
    expect(
      series([
        pump(D + 9 * HOUR, { mlLeft: 80, mlRight: 40 }),
        pump(D + 57 * HOUR, { mlRight: 60 }),
      ]),
    ).toEqual({
      unit: 'ml',
      days: [
        { day: days[0], value: 120 },
        { day: days[1], value: 0 },
        { day: days[2], value: 60 },
      ],
    });
  });

  it('ignores a running pump: an ml window stays in ml while a pump runs', () => {
    expect(series([pump(D + 9 * HOUR, { mlLeft: 80 }), pump(D + 10 * HOUR, {}, false)]).unit).toBe(
      'ml',
    );
  });

  it('is an all-zero ml series with no pump (the chart shows its empty text)', () => {
    expect(series([])).toEqual({ unit: 'ml', days: days.map((day) => ({ day, value: 0 })) });
  });
});

describe('the breastfeeding and bottle tiles', () => {
  const en = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate('en', key, vars);
  const day = (feeds: number, bottles: number, breastMin: number, bottleMl = 0) => ({
    feeds,
    bottles,
    breastMs: breastMin * MINUTE,
    bottleMl,
  });
  const minutes = (m: number) => t('time.minutes', { m });
  const full = (n: number, m: number) => [String(n), t('summary.tile.breastfeed.minutes', { m })];

  it('counts breastfeeds only, never the bottles, with the minutes at the breast', () => {
    // 5 feeds of which 2 bottles: 3 breastfeeds.
    expect(breastfeedTile(t, day(5, 2, 90), day(0, 0, 0)).parts).toEqual(full(3, 90));
    // Over two hours still reads in minutes, never "2 h 10 min".
    expect(breastfeedTile(t, day(6, 0, 130), day(0, 0, 0)).parts).toEqual(full(6, 130));
    expect(breastMinutes(29_999)).toBe(0);
    expect(breastMinutes(30_000)).toBe(1);
  });

  it('reads "5 (90 min)" and "1 (15 min)" in English: a bare count, no "times" word', () => {
    expect(breastfeedTile(en, day(5, 0, 90), day(0, 0, 0)).parts).toEqual(['5', '(90 min)']);
    expect(breastfeedTile(en, day(1, 0, 15), day(0, 0, 0)).parts).toEqual(['1', '(15 min)']);
    expect(breastfeedTile(t, day(1, 0, 15), day(0, 0, 0)).parts).toEqual(full(1, 15));
  });

  it('a bottle-only day reads the empty "0", with no diff when the day before had none either', () => {
    expect(breastfeedTile(t, day(3, 3, 0), day(2, 2, 0))).toEqual({ parts: ['0'], diff: null });
  });

  it('a day with no breastfeeding after one with: the full "0 (0 min)" beside its minutes diff', () => {
    expect(breastfeedTile(t, day(1, 1, 0), day(1, 0, 40))).toEqual({
      parts: full(0, 0),
      diff: t('summary.diff.minutes', { sign: '−', value: minutes(40) }),
    });
    expect(breastfeedTile(en, day(0, 0, 0), day(1, 0, 40))).toEqual({
      parts: ['0', '(0 min)'],
      diff: '−40 min from the day before',
    });
  });

  it('a feed from before midnight gives the next day its minutes alone, not "0 (20 min)"', () => {
    expect(breastfeedTile(t, day(0, 0, 20), day(1, 0, 10))).toEqual({
      parts: [minutes(20)],
      diff: t('summary.diff.minutes', { sign: '+', value: minutes(10) }),
    });
  });

  it('counts a running feed up to now, as the day totals do', () => {
    const start = new Date(2026, 8, 25, 9, 0).getTime();
    const now = start + 25 * MINUTE;
    const feed = {
      id: 'f',
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      segments: [{ side: 'L', start }],
      createdAt: 0,
      updatedAt: 0,
    } as TrackerEvent;
    const dayStart = new Date(2026, 8, 25).getTime();
    const totals = dailyTotals([feed], 'a', dayStart, dayStart + 24 * HOUR, now);
    expect(breastfeedTile(t, totals, day(0, 0, 0)).parts).toEqual(full(1, 25));
  });

  it('compares the minutes with the day before, not the count', () => {
    expect(breastfeedTile(t, day(2, 0, 90), day(5, 0, 70)).diff).toBe(
      t('summary.diff.minutes', { sign: '+', value: minutes(20) }),
    );
    expect(breastfeedTile(t, day(2, 0, 55), day(1, 0, 70)).diff).toBe(
      t('summary.diff.minutes', { sign: '−', value: minutes(15) }),
    );
    expect(breastfeedTile(t, day(2, 0, 70), day(3, 0, 70)).diff).toBe(
      t('summary.diff.same.minutes', { value: minutes(70) }),
    );
    // Rounded first: 70 min and 70 min 20 s are the same.
    const close = { ...day(1, 0, 70), breastMs: 70 * MINUTE + 20_000 };
    expect(breastfeedTile(t, close, day(1, 0, 70)).diff).toBe(
      t('summary.diff.same.minutes', { value: minutes(70) }),
    );
    expect(breastfeedTile(t, day(1, 0, 30), day(0, 0, 0)).diff).toBe(
      t('summary.diff.minutes', { sign: '+', value: minutes(30) }),
    );
  });

  it('the bottle tile counts the bottles with their ml, its diff on the ml', () => {
    expect(bottleTile(t, day(3, 3, 0, 240), day(2, 2, 0, 180))).toEqual({
      parts: ['3', t('summary.tile.bottle.ml', { ml: 240 })],
      diff: t('summary.diff.ml', { sign: '+', value: t('unit.ml', { ml: 60 }) }),
    });
    expect(bottleTile(en, day(1, 1, 0, 90), day(0, 0, 0)).parts).toEqual(['1', '(90 ml)']);
    expect(bottleTile(en, day(3, 3, 0, 240), day(0, 0, 0)).parts).toEqual(['3', '(240 ml)']);
    // No bottle: the plain "0 ml", as before.
    expect(bottleTile(t, day(0, 0, 0), day(1, 1, 0, 90))).toEqual({
      parts: [t('unit.ml', { ml: 0 })],
      diff: t('summary.diff.ml', { sign: '−', value: t('unit.ml', { ml: 90 }) }),
    });
  });
});
