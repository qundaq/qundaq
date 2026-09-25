import { DAY } from './time';

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The start of the day `n` days after the day starting at `dayStart`, by the calendar, so 23 h and 25 h days are right. */
export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function dayWindow(ms: number): { from: number; to: number } {
  const from = startOfDay(ms);
  return { from, to: addDays(from, 1) };
}

/** Calendar days from the day starting at `fromDayStart` to the day containing `ms` (negative: earlier). */
export function dayOffset(fromDayStart: number, ms: number): number {
  return Math.round((startOfDay(ms) - fromDayStart) / DAY);
}

/** Length of [start, end) ∩ [from, to), never negative. */
export function overlapMs(start: number, end: number, from: number, to: number): number {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

/** The day a screen shows: `null` means "today" (so the screen follows midnight); a later day shows today. */
export function resolveDay(day: number | null, now: number): number {
  const today = startOfDay(now);
  return day === null ? today : Math.min(startOfDay(day), today);
}

/** The day `n` days from the shown one; landing on today (or later) gives `null`, "today". */
export function stepDay(day: number | null, now: number, n: number): number | null {
  const next = addDays(resolveDay(day, now), n);
  return next >= startOfDay(now) ? null : next;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Value for <input type="date">: the local calendar day. */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The start of the local day an <input type="date"> value names, or null for '' and impossible dates. */
export function fromDateInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 ? date.getTime() : null;
}
