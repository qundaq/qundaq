import { addDays, overlapMs } from './days';
import type { Id, TrackerEvent } from './types';

/** A span within one day, as a fraction of it: 0 is the day's start, 1 its end. */
export interface DayInterval {
  startPct: number;
  endPct: number;
}

export interface DaySchedule {
  sleep: readonly DayInterval[];
  /** 0..1 fractions: where a breastfeed or a bottle that STARTED this day sits in it. */
  feedMarks: readonly number[];
}

/**
 * One baby's picture of a day, for the "day inside" strip. The day is the real calendar day,
 * [dayStart, addDays(dayStart, 1)) — 23 or 25 hours on a daylight-saving change — and every fraction
 * is of that real length. `sleep` clips each sleep event to the day, a running one up to `now`,
 * mirroring how `dailyTotals`'s `sleepMs` is computed. `feedMarks` has one point per breastfeed or
 * bottle that STARTED inside the day, at the event's own `startAt` (a feed with several side
 * switches marks once) — the same predicate `dailyTotals` uses for `feeds`, so the strip's dot
 * count always agrees with the feed tile.
 */
export function daySchedule(
  events: readonly TrackerEvent[],
  babyId: Id,
  dayStart: number,
  now: number,
): DaySchedule {
  const dayEnd = addDays(dayStart, 1);
  const dayLength = dayEnd - dayStart;
  const sleep: DayInterval[] = [];
  const feedMarks: number[] = [];
  for (const event of events) {
    if (event.babyId !== babyId || event.deletedAt !== undefined) continue;
    if (event.type === 'sleep') {
      const ms = overlapMs(event.startAt, event.endAt ?? now, dayStart, dayEnd);
      if (ms > 0) {
        const start = Math.max(event.startAt, dayStart);
        sleep.push({
          startPct: (start - dayStart) / dayLength,
          endPct: (start + ms - dayStart) / dayLength,
        });
      }
    } else if (
      (event.type === 'breastfeed' || event.type === 'bottle') &&
      event.startAt >= dayStart &&
      event.startAt < dayEnd
    ) {
      feedMarks.push((event.startAt - dayStart) / dayLength);
    }
  }
  return { sleep, feedMarks };
}
