import type { TimerMinutes } from '../domain/sounds';
import { MINUTE } from '../domain/time';

export { DEFAULT_TIMER, TIMER_CHOICES, TIMER_MINUTES, isTimerChoice } from '../domain/sounds';
export type { TimerChoice, TimerMinutes } from '../domain/sounds';

/** The sound fades out over the last 30 seconds of the timer. */
export const FADE_SECONDS = 30;
/** Cancelling or moving a timer during its fade brings the sound back up over this long, never at once. */
export const RECOVER_SECONDS = 3;

/** Wall-clock end of a timer started at `now` (epoch ms). Pausing does not stop the countdown. */
export function timerEndsAt(now: number, minutes: TimerMinutes): number {
  return now + minutes * MINUTE;
}

/** Whole minutes left, rounded up (sounds.remaining, "{m} minutes left"); 0 once the timer has ended. */
export function minutesLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / MINUTE));
}

/** One scheduled change of the sleep gain, in audio-clock seconds. */
export interface SleepStep {
  kind: 'set' | 'linear';
  value: number;
  time: number;
}

/**
 * The sleep gain's schedule from `audioNow` on, for a timer that ends at `endsAt` (epoch ms, read against
 * `nowMs`), starting from `current`, the value held now. The fade runs from `end − 30 s` to `end`. It never
 * rises except, before a fade that is still more than RECOVER_SECONDS away, a ramp back to 1 over that long.
 * Inside the last 30 s it starts from the value the fade has reached by now, or from `current` if lower.
 */
export function sleepSteps(
  endsAt: number,
  nowMs: number,
  audioNow: number,
  current: number,
): SleepStep[] {
  const end = audioNow + Math.max(0, endsAt - nowMs) / 1000;
  const fadeStart = end - FADE_SECONDS;
  if (fadeStart >= audioNow + RECOVER_SECONDS) {
    return [
      ...recoverSteps(audioNow, current),
      { kind: 'set', value: 1, time: fadeStart },
      { kind: 'linear', value: 0, time: end },
    ];
  }
  const reached = Math.min(1, Math.max(0, (end - audioNow) / FADE_SECONDS));
  return [
    { kind: 'set', value: Math.min(current, reached), time: audioNow },
    { kind: 'linear', value: 0, time: end },
  ];
}

/** No timer (any more): back to full over RECOVER_SECONDS, from `current`. */
export function recoverSteps(audioNow: number, current: number): SleepStep[] {
  return current < 1 ? [{ kind: 'linear', value: 1, time: audioNow + RECOVER_SECONDS }] : [];
}
