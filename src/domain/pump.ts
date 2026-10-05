import { MAX_PUMP_MIN } from './rules';
import { MINUTE } from './time';
import type { TrackerEvent } from './types';

export type PumpEvent = Extract<TrackerEvent, { type: 'pump' }>;

/** A pump timer's elapsed time in whole minutes: rounded, never below 1 nor above MAX_PUMP_MIN. */
export function pumpMinutes(ms: number): number {
  return Math.min(MAX_PUMP_MIN, Math.max(1, Math.round(ms / MINUTE)));
}

/**
 * When a pump logged afterwards began. Sequential assumption: the sides were pumped one after the other,
 * so it began (minLeft + minRight) minutes before it ended; with no minutes (ml only) it is a moment.
 */
export function pumpStartAt(endAt: number, minLeft = 0, minRight = 0): number {
  return endAt - (minLeft + minRight) * MINUTE;
}

/**
 * The running pump finished at `endAt` (never before it began): the elapsed minutes go on the side it ran
 * on ('B': on both), replacing what that side had, and the timer's side is dropped. A side this version
 * does not know (a malformed row) gets nothing: it is never guessed at.
 */
export function finishedPump<T extends PumpEvent>(event: T, endAt: number): T {
  const end = Math.max(endAt, event.startAt);
  const minutes = pumpMinutes(end - event.startAt);
  const { side, ...rest } = event;
  return {
    ...rest,
    endAt: end,
    ...(side === 'L' || side === 'B' ? { minLeft: minutes } : {}),
    ...(side === 'R' || side === 'B' ? { minRight: minutes } : {}),
  } as T;
}

/** The parent's pump timer while it runs (one at a time), or null. */
export function runningPump(events: readonly TrackerEvent[]): PumpEvent | null {
  return (
    events.find(
      (event): event is PumpEvent =>
        event.type === 'pump' && event.deletedAt === undefined && event.endAt === undefined,
    ) ?? null
  );
}
