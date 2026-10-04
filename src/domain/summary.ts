import { compareIds } from './ids';
import { addDays, dayOffset, overlapMs } from './days';
import type { Id, Side, TrackerEvent } from './types';

export interface DailyTotals {
  feeds: number; // breastfeeds and bottles that started in the window
  breastMs: number; // breastfeeding time inside the window, from the segments (a running one up to now)
  breastMsBySide: { L: number; R: number };
  bottleMl: number; // bottles that started in the window
  bottles: number;
  sleepMs: number; // sleep inside the window, clipped (a running one up to now)
  sleeps: number; // sleeps that started in the window
  wet: number; // diapers in the window with wet = true
  dirty: number; // diapers in the window with dirty = true (a wet + dirty one counts in both)
  diapers: number;
}

export type GrowthMetric = 'weightG' | 'heightMm' | 'headMm';
export const GROWTH_METRICS: readonly GrowthMetric[] = ['weightG', 'heightMm', 'headMm'];

export interface GrowthPoint {
  at: number;
  value: number;
}

function emptyTotals(): DailyTotals {
  return {
    feeds: 0,
    breastMs: 0,
    breastMsBySide: { L: 0, R: 0 },
    bottleMl: 0,
    bottles: 0,
    sleepMs: 0,
    sleeps: 0,
    wet: 0,
    dirty: 0,
    diapers: 0,
  };
}

const finite = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const isSide = (side: unknown): side is Side => side === 'L' || side === 'R';

/**
 * One baby's totals for [from, to). Counts go by start time; durations are clipped to the window, and a
 * running sleep or feed counts up to `now`. Deleted entries are left out, and a row with missing fields
 * (for example a bad import) never throws.
 */
export function dailyTotals(
  events: readonly TrackerEvent[],
  babyId: Id,
  from: number,
  to: number,
  now: number,
): DailyTotals {
  const totals = emptyTotals();
  const startsInside = (event: TrackerEvent) => event.startAt >= from && event.startAt < to;
  for (const event of events) {
    if (event.babyId !== babyId || event.deletedAt !== undefined) continue;
    switch (event.type) {
      case 'breastfeed': {
        if (startsInside(event)) totals.feeds += 1;
        for (const segment of event.segments ?? []) {
          if (!isSide(segment.side)) continue;
          const ms = overlapMs(segment.start, segment.end ?? event.endAt ?? now, from, to);
          totals.breastMs += ms;
          totals.breastMsBySide[segment.side] += ms;
        }
        break;
      }
      case 'bottle':
        if (startsInside(event)) {
          totals.feeds += 1;
          totals.bottles += 1;
          totals.bottleMl += finite(event.ml);
        }
        break;
      case 'sleep':
        totals.sleepMs += overlapMs(event.startAt, event.endAt ?? now, from, to);
        if (startsInside(event)) totals.sleeps += 1;
        break;
      case 'diaper':
        if (startsInside(event)) {
          totals.diapers += 1;
          if (event.wet) totals.wet += 1;
          if (event.dirty) totals.dirty += 1;
        }
        break;
      default:
        break;
    }
  }
  return totals;
}

export interface PumpReport {
  sessions: number;
  totalMl: number;
  leftMl: number;
  rightMl: number;
  perDay: { day: number; ml: number }[]; // one entry per calendar day of [from, to), oldest first
  averagePerDay: number;
}

/** Live baby-less pumps that started in [from, to): sessions, ml per side, ml per day and the daily average. */
export function pumpReport(events: readonly TrackerEvent[], from: number, to: number): PumpReport {
  const perDay: { day: number; ml: number }[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) perDay.push({ day, ml: 0 });
  let sessions = 0;
  let leftMl = 0;
  let rightMl = 0;
  for (const event of events) {
    if (
      event.type !== 'pump' ||
      event.deletedAt !== undefined ||
      event.startAt < from ||
      event.startAt >= to
    )
      continue;
    const left = finite(event.mlLeft);
    const right = finite(event.mlRight);
    sessions += 1;
    leftMl += left;
    rightMl += right;
    const entry = perDay[dayOffset(from, event.startAt)];
    if (entry) entry.ml += left + right;
  }
  const totalMl = leftMl + rightMl;
  return {
    sessions,
    totalMl,
    leftMl,
    rightMl,
    perDay,
    averagePerDay: perDay.length === 0 ? 0 : Math.round(totalMl / perDay.length),
  };
}

/** Seven entries: the day starting at `lastDayStart` first, followed by the six days before it. */
export function weekTotals(
  events: readonly TrackerEvent[],
  babyId: Id,
  lastDayStart: number,
  now: number,
): { dayStart: number; totals: DailyTotals }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = addDays(lastDayStart, -i);
    return { dayStart, totals: dailyTotals(events, babyId, dayStart, addDays(dayStart, 1), now) };
  });
}

/** The growth entries that have `metric`, as points, oldest first. */
export function growthSeries(events: readonly TrackerEvent[], metric: GrowthMetric): GrowthPoint[] {
  const points: Array<{ at: number; value: number; id: Id }> = [];
  for (const event of events) {
    if (event.type !== 'growth' || event.deletedAt !== undefined) continue;
    const value = event[metric];
    if (typeof value === 'number' && Number.isFinite(value))
      points.push({ at: event.startAt, value, id: event.id });
  }
  return points
    .sort((a, b) => a.at - b.at || compareIds(a.id, b.id))
    .map(({ at, value }) => ({ at, value }));
}
