// Set before any date below is computed, and restored after, so no other file in this worker inherits it.
const previousTz = process.env.TZ;
process.env.TZ = 'Europe/Berlin'; // a real DST-observing zone; Europe/Istanbul (used by e2e) has none since 2016
import { afterAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/days';
import { daySchedule } from '../../src/domain/dayStrip';
import { DAY, HOUR, MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';

const DAY_START = new Date(2026, 8, 27, 0, 0).getTime(); // a local midnight
const NOW = DAY_START + 20 * HOUR;
const base = { id: 'x', babyId: 'a', createdAt: DAY_START, updatedAt: DAY_START };

function sleep(id: string, startAt: number, endAt?: number): TrackerEvent {
  return {
    ...base,
    id,
    type: 'sleep',
    startAt,
    ...(endAt === undefined ? {} : { endAt }),
  };
}
function feed(id: string, startAt: number, sides: ('L' | 'R')[] = ['L']): TrackerEvent {
  const segments = sides.map((side, i) => ({
    side,
    start: startAt + i * 10 * MINUTE,
    end: startAt + (i + 1) * 10 * MINUTE,
  }));
  return {
    ...base,
    id,
    type: 'breastfeed',
    startAt,
    endAt: segments.at(-1)!.end,
    segments,
  };
}
function bottle(id: string, startAt: number): TrackerEvent {
  return { ...base, id, type: 'bottle', startAt, ml: 90, contents: 'formula' };
}

afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

describe('daySchedule', () => {
  it('places a sleep entirely inside the day as one fraction pair', () => {
    const events = [sleep('s1', DAY_START + 2 * HOUR, DAY_START + 3 * HOUR)];
    expect(daySchedule(events, 'a', DAY_START, NOW)).toEqual({
      sleep: [{ startPct: 2 / 24, endPct: 3 / 24 }],
      feedMarks: [],
    });
  });

  it('clips a sleep that spans into the day from before it', () => {
    const events = [sleep('s1', DAY_START - HOUR, DAY_START + HOUR)];
    expect(daySchedule(events, 'a', DAY_START, NOW).sleep).toEqual([
      { startPct: 0, endPct: 1 / 24 },
    ]);
  });

  it('clips a sleep that spans out of the day, past it', () => {
    const events = [sleep('s1', DAY_START + 23 * HOUR, DAY_START + DAY + HOUR)];
    expect(daySchedule(events, 'a', DAY_START, NOW).sleep).toEqual([
      { startPct: 23 / 24, endPct: 1 },
    ]);
  });

  it('clips a running sleep to now', () => {
    const events = [sleep('s1', DAY_START + 18 * HOUR)]; // no endAt: still running
    expect(daySchedule(events, 'a', DAY_START, NOW).sleep).toEqual([
      { startPct: 18 / 24, endPct: 20 / 24 },
    ]);
  });

  it('keeps two overlapping sleeps as two intervals (bad data, never crashes)', () => {
    const events = [
      sleep('s1', DAY_START + HOUR, DAY_START + 3 * HOUR),
      sleep('s2', DAY_START + 2 * HOUR, DAY_START + 4 * HOUR),
    ];
    expect(daySchedule(events, 'a', DAY_START, NOW).sleep).toEqual([
      { startPct: 1 / 24, endPct: 3 / 24 },
      { startPct: 2 / 24, endPct: 4 / 24 },
    ]);
  });

  it('marks a breastfeed once, at its own start, not once per side', () => {
    const events = [feed('f1', DAY_START + 9 * HOUR, ['L', 'R'])];
    expect(daySchedule(events, 'a', DAY_START, NOW).feedMarks).toEqual([9 / 24]);
  });

  it('marks a bottle at its instant', () => {
    const events = [bottle('b1', DAY_START + 14 * HOUR)];
    expect(daySchedule(events, 'a', DAY_START, NOW).feedMarks).toEqual([14 / 24]);
  });

  it('never marks a feed that started the day before, even if it is still running', () => {
    const events = [
      {
        ...feed('f1', DAY_START - 30 * MINUTE, ['L']),
        endAt: undefined,
        segments: [{ side: 'L' as const, start: DAY_START - 30 * MINUTE }],
      },
    ];
    expect(daySchedule(events, 'a', DAY_START, NOW).feedMarks).toEqual([]);
  });

  it('leaves out another baby, a deleted row, and every other event type', () => {
    const events: TrackerEvent[] = [
      sleep('s1', DAY_START + HOUR, DAY_START + 2 * HOUR),
      { ...sleep('s2', DAY_START + 3 * HOUR, DAY_START + 4 * HOUR), babyId: 'b' },
      { ...feed('f1', DAY_START + 5 * HOUR), deletedAt: NOW },
      {
        ...base,
        id: 'd1',
        type: 'diaper',
        startAt: DAY_START + 6 * HOUR,
        wet: true,
        dirty: false,
      },
    ];
    expect(daySchedule(events, 'a', DAY_START, NOW)).toEqual({
      sleep: [{ startPct: 1 / 24, endPct: 2 / 24 }],
      feedMarks: [],
    });
  });

  it('uses the real calendar day length, not a fixed 24h, on a daylight-saving change day', () => {
    const dayStart = new Date(2026, 9, 25, 0, 0).getTime(); // Europe/Berlin: clocks fall back this night, a 25h day
    const realDayEnd = addDays(dayStart, 1);
    expect(realDayEnd - dayStart).not.toBe(DAY); // sanity: this really is not a 24h day
    const lateFeedAt = realDayEnd - 30 * MINUTE; // the day's last half hour, by the REAL boundary
    const events = [bottle('lateFeed', lateFeedAt)];
    expect(daySchedule(events, 'a', dayStart, realDayEnd).feedMarks).toEqual([
      (lateFeedAt - dayStart) / (realDayEnd - dayStart),
    ]);
  });
});
