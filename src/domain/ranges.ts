import { addDays, dayOffset, startOfDay } from './days';

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30';

export type RangeChoice =
  { kind: 'preset'; preset: RangePreset } | { kind: 'custom'; from: number; to: number }; // both start-of-day ms, inclusive days

/** [start of the first day, start of the day after the last). */
export interface DayRange {
  from: number;
  to: number;
}

export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE: RangeChoice = { kind: 'preset', preset: 'today' };

const PRESET_DAYS: Record<RangePreset, number> = { today: 1, yesterday: 1, last7: 7, last30: 30 };

export function resolveRange(choice: RangeChoice, now: number): DayRange {
  if (choice.kind === 'custom') return { from: choice.from, to: addDays(choice.to, 1) };
  const today = startOfDay(now);
  const last = choice.preset === 'yesterday' ? addDays(today, -1) : today;
  return { from: addDays(last, 1 - PRESET_DAYS[choice.preset]), to: addDays(last, 1) };
}

/** Calendar days in the range (a 23 h or 25 h day still counts as one). */
export function rangeDays(range: DayRange): number {
  return dayOffset(range.from, range.to);
}

export function isSingleDay(range: DayRange): boolean {
  return rangeDays(range) === 1;
}

/** A custom range ending no later than today, starting no later than its end, at most MAX_RANGE_DAYS long. */
export function customRange(fromDay: number, toDay: number, now: number): RangeChoice {
  const to = Math.min(startOfDay(toDay), startOfDay(now));
  let from = Math.min(startOfDay(fromDay), to);
  if (dayOffset(from, to) >= MAX_RANGE_DAYS) from = addDays(to, 1 - MAX_RANGE_DAYS);
  return { kind: 'custom', from, to };
}

/** Moves a one-day range by `delta` days, never past today, as a one-day custom range. */
export function stepRange(range: DayRange, delta: -1 | 1, now: number): RangeChoice {
  const day = Math.min(addDays(range.from, delta), startOfDay(now));
  return { kind: 'custom', from: day, to: day };
}
