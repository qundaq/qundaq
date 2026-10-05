import { TEMPERATURE_RANGE_C, isOpen, isTimedType } from './rules';
import { HOUR } from './time';
import type { TrackerEvent } from './types';

export const FEVER_C = 38;
export const LOW_TEMPERATURE_C = 36;
export type TemperatureAlert = 'fever' | 'low';

/** A hint, never a block. Values outside the valid range (a half-typed "3", say) give no hint. */
export function temperatureAlert(celsius: number): TemperatureAlert | null {
  const [min, max] = TEMPERATURE_RANGE_C;
  if (!Number.isFinite(celsius) || celsius < min || celsius > max) return null;
  if (celsius >= FEVER_C) return 'fever';
  if (celsius < LOW_TEMPERATURE_C) return 'low';
  return null;
}

/** How long a timer may run before Home asks "Forgot to stop?" (and a restored one counts as stale). */
export const FORGOTTEN_AFTER_MS = {
  sleep: 12 * HOUR,
  breastfeed: 2 * HOUR,
  pump: 2 * HOUR,
} as const;

export function forgottenTimer(event: TrackerEvent, now: number): boolean {
  if (event.deletedAt !== undefined || !isOpen(event)) return false;
  if (!isTimedType(event.type)) return false;
  return now - event.startAt > FORGOTTEN_AFTER_MS[event.type];
}
