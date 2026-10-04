import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/days';
import { dailyTotals, growthSeries, pumpReport, weekTotals } from '../../src/domain/summary';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';

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
let seq = 0;
function ev(draft: EventDraft, extra: Partial<TrackerEvent> = {}): TrackerEvent {
  seq += 1;
  return { ...draft, id: `e${seq}`, createdAt: 0, updatedAt: 0, ...extra } as TrackerEvent;
}

describe('dailyTotals', () => {
  it('splits a sleep that crosses midnight between the two days; the count goes to the day it began', () => {
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(9, 24, 23), endAt: at(9, 25, 2) });
    const now = at(9, 25, 12);
    expect(dailyTotals([sleep], 'a', at(9, 24), at(9, 25), now)).toMatchObject({
      sleepMs: HOUR,
      sleeps: 1,
    });
    expect(dailyTotals([sleep], 'a', at(9, 25), at(9, 26), now)).toMatchObject({
      sleepMs: 2 * HOUR,
      sleeps: 0,
    });
  });

  it('a running sleep counts up to now', () => {
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(9, 25, 9) });
    expect(dailyTotals([sleep], 'a', at(9, 25), at(9, 26), at(9, 25, 10, 30))).toMatchObject({
      sleepMs: 90 * MINUTE,
      sleeps: 1,
    });
  });

  it('a 25-hour day can hold 25 hours of sleep', () => {
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(10, 24, 22), endAt: at(10, 26, 2) });
    expect(dailyTotals([sleep], 'a', at(10, 25), at(10, 26), at(10, 27)).sleepMs).toBe(25 * HOUR);
  });

  it('breastfeeding time comes from the segments, per side, a running one up to now', () => {
    const start = at(9, 25, 8);
    const finished = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      endAt: start + 20 * MINUTE,
      segments: [
        { side: 'L', start, end: start + 10 * MINUTE },
        { side: 'R', start: start + 12 * MINUTE, end: start + 20 * MINUTE },
      ],
    });
    const runningStart = at(9, 25, 11);
    const running = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: runningStart,
      segments: [{ side: 'L', start: runningStart }],
    });
    const totals = dailyTotals(
      [finished, running],
      'a',
      at(9, 25),
      at(9, 26),
      runningStart + 5 * MINUTE,
    );
    expect(totals).toMatchObject({
      feeds: 2,
      breastMs: 23 * MINUTE,
      breastMsBySide: { L: 15 * MINUTE, R: 8 * MINUTE },
    });
  });

  it('counts bottles and feeds by start time', () => {
    const events = [
      ev({ type: 'bottle', babyId: 'a', startAt: at(9, 25, 7), ml: 90, contents: 'formula' }),
      ev({ type: 'bottle', babyId: 'a', startAt: at(9, 25, 13), ml: 120, contents: 'breastmilk' }),
      ev({ type: 'bottle', babyId: 'a', startAt: at(9, 24, 23), ml: 60, contents: 'formula' }),
    ];
    expect(dailyTotals(events, 'a', at(9, 25), at(9, 26), at(9, 25, 20))).toMatchObject({
      feeds: 2,
      bottles: 2,
      bottleMl: 210,
    });
  });

  it('a wet and dirty diaper counts as both', () => {
    const events = [
      ev({
        type: 'diaper',
        babyId: 'a',
        startAt: at(9, 25, 6),
        wet: true,
        dirty: true,
        stoolColor: 'yellow',
      }),
      ev({ type: 'diaper', babyId: 'a', startAt: at(9, 25, 9), wet: true, dirty: false }),
      ev({ type: 'diaper', babyId: 'a', startAt: at(9, 25, 12), wet: false, dirty: true }),
    ];
    expect(dailyTotals(events, 'a', at(9, 25), at(9, 26), at(9, 25, 20))).toMatchObject({
      diapers: 3,
      wet: 2,
      dirty: 2,
    });
  });

  it('ignores other babies and deleted entries, and survives rows with missing fields', () => {
    const events = [
      ev({ type: 'diaper', babyId: 'b', startAt: at(9, 25, 6), wet: true, dirty: false }),
      ev(
        { type: 'diaper', babyId: 'a', startAt: at(9, 25, 7), wet: true, dirty: false },
        { deletedAt: at(9, 25, 8) },
      ),
      {
        id: 'broken-bottle',
        type: 'bottle',
        babyId: 'a',
        startAt: at(9, 25, 9),
        createdAt: 0,
        updatedAt: 0,
      } as unknown as TrackerEvent,
      {
        id: 'broken-feed',
        type: 'breastfeed',
        babyId: 'a',
        startAt: at(9, 25, 10),
        endAt: at(9, 25, 11),
        createdAt: 0,
        updatedAt: 0,
      } as unknown as TrackerEvent,
    ];
    expect(dailyTotals(events, 'a', at(9, 25), at(9, 26), at(9, 25, 20))).toEqual({
      feeds: 2,
      breastMs: 0,
      breastMsBySide: { L: 0, R: 0 },
      bottleMl: 0,
      bottles: 1,
      sleepMs: 0,
      sleeps: 0,
      wet: 0,
      dirty: 0,
      diapers: 0,
    });
  });
});

describe('weekTotals', () => {
  it('gives seven days: the chosen day first, then the six before it', () => {
    const lastDay = at(10, 27);
    const week = weekTotals([], 'a', lastDay, at(10, 27, 12));
    expect(week.map((entry) => entry.dayStart)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(lastDay, -i)),
    );
    expect(week[2]!.dayStart).toBe(at(10, 25));
  });

  it('puts each entry on its own day', () => {
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(9, 24, 23), endAt: at(9, 25, 2) });
    const week = weekTotals([sleep], 'a', at(9, 25), at(9, 25, 12));
    expect(week[0]!.totals.sleepMs).toBe(2 * HOUR);
    expect(week[1]!.totals.sleepMs).toBe(HOUR);
    expect(week[2]!.totals.sleepMs).toBe(0);
  });
});

describe('pumpReport', () => {
  const pump = (startAt: number, sides: { mlLeft?: number; mlRight?: number }, extra = {}) =>
    ev({ type: 'pump', babyId: null, startAt, ...sides }, extra);

  it('is all zeros for no events, with a zero-filled day per calendar day', () => {
    expect(pumpReport([], at(9, 23), at(9, 26))).toEqual({
      sessions: 0,
      totalMl: 0,
      leftMl: 0,
      rightMl: 0,
      perDay: [
        { day: at(9, 23), ml: 0 },
        { day: at(9, 24), ml: 0 },
        { day: at(9, 25), ml: 0 },
      ],
      averagePerDay: 0,
    });
  });

  it('reports one session', () => {
    const report = pumpReport(
      [pump(at(9, 25, 7), { mlLeft: 60, mlRight: 50 })],
      at(9, 25),
      at(9, 26),
    );
    expect(report).toEqual({
      sessions: 1,
      totalMl: 110,
      leftMl: 60,
      rightMl: 50,
      perDay: [{ day: at(9, 25), ml: 110 }],
      averagePerDay: 110,
    });
  });

  it('counts a missing or non-finite side as 0', () => {
    const report = pumpReport(
      [
        pump(at(9, 25, 7), { mlRight: 40 }),
        pump(at(9, 25, 9), { mlLeft: Number.NaN, mlRight: 10 }),
      ],
      at(9, 25),
      at(9, 26),
    );
    expect(report).toMatchObject({ sessions: 2, totalMl: 50, leftMl: 0, rightMl: 50 });
  });

  it('puts each pump on its day and excludes deleted, non-pump, baby and out-of-range events', () => {
    const events = [
      pump(at(9, 23, 8), { mlLeft: 30 }),
      pump(at(9, 25, 8), { mlLeft: 20, mlRight: 20 }),
      pump(at(9, 26), { mlLeft: 99 }),
      pump(at(9, 22, 23), { mlLeft: 99 }),
      pump(at(9, 24, 8), { mlLeft: 99 }, { deletedAt: at(9, 24, 9) }),
      ev({ type: 'bottle', babyId: 'a', startAt: at(9, 24, 10), ml: 120, contents: 'formula' }),
    ];
    const report = pumpReport(events, at(9, 23), at(9, 26));
    expect(report.sessions).toBe(2);
    expect(report.totalMl).toBe(70);
    expect(report.perDay).toEqual([
      { day: at(9, 23), ml: 30 },
      { day: at(9, 24), ml: 0 },
      { day: at(9, 25), ml: 40 },
    ]);
  });

  it('rounds the daily average', () => {
    const report = pumpReport([pump(at(9, 24, 8), { mlLeft: 100 })], at(9, 23), at(9, 26));
    expect(report.averagePerDay).toBe(33);
    const two = pumpReport([pump(at(9, 24, 8), { mlLeft: 101 })], at(9, 24), at(9, 26));
    expect(two.averagePerDay).toBe(51);
  });

  it('has the right number of days across a DST change', () => {
    expect(pumpReport([], at(10, 24), at(10, 27)).perDay.map((d) => d.day)).toEqual([
      at(10, 24),
      at(10, 25),
      at(10, 26),
    ]);
  });
});

describe('growthSeries', () => {
  it('returns the entries that have the metric, oldest first', () => {
    const events = [
      ev({ type: 'growth', babyId: 'a', startAt: at(9, 20, 9), weightG: 3600, headMm: 355 }),
      ev({ type: 'growth', babyId: 'a', startAt: at(9, 10, 9), weightG: 3300 }),
      ev({ type: 'growth', babyId: 'a', startAt: at(9, 15, 9), heightMm: 520 }),
      ev(
        { type: 'growth', babyId: 'a', startAt: at(9, 12, 9), weightG: 3400 },
        { deletedAt: at(9, 12, 10) },
      ),
    ];
    expect(growthSeries(events, 'weightG')).toEqual([
      { at: at(9, 10, 9), value: 3300 },
      { at: at(9, 20, 9), value: 3600 },
    ]);
    expect(growthSeries(events, 'headMm')).toEqual([{ at: at(9, 20, 9), value: 355 }]);
  });

  it('two growth entries at the same instant always sort in the same, id-ordered, order', () => {
    const atTime = Date.now();
    const a = {
      id: 'b',
      type: 'growth' as const,
      babyId: 'x',
      startAt: atTime,
      weightG: 3000,
      createdAt: atTime,
      updatedAt: atTime,
    };
    const b = {
      id: 'a',
      type: 'growth' as const,
      babyId: 'x',
      startAt: atTime,
      weightG: 3100,
      createdAt: atTime,
      updatedAt: atTime,
    };
    expect(growthSeries([a, b], 'weightG').map((p) => p.value)).toEqual(
      growthSeries([b, a], 'weightG').map((p) => p.value),
    );
  });
});
