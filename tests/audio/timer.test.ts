import { describe, expect, it } from 'vitest';
import { Automation } from '../../src/audio/automation';
import {
  DEFAULT_TIMER,
  FADE_SECONDS,
  RECOVER_SECONDS,
  TIMER_CHOICES,
  isTimerChoice,
  minutesLeft,
  recoverSteps,
  sleepSteps,
  timerEndsAt,
  type SleepStep,
} from '../../src/audio/timer';
import { MINUTE } from '../../src/domain/time';

const NOW = 1_790_000_000_000;

/** The sleep gain after holding `current` at `audioNow` and applying `steps`. */
function curve(current: number, audioNow: number, steps: readonly SleepStep[]): Automation {
  const param = new Automation(1);
  param.setValueAtTime(current, audioNow);
  for (const step of steps) {
    if (step.kind === 'set') param.setValueAtTime(step.value, step.time);
    else param.linearRampToValueAtTime(step.value, step.time);
  }
  return param;
}

describe('timer choices', () => {
  it('offers 15, 30 and 60 minutes and ∞, with 60 selected by default', () => {
    expect(TIMER_CHOICES).toEqual([15, 30, 60, null]);
    expect(DEFAULT_TIMER).toBe(60);
    expect(isTimerChoice(30)).toBe(true);
    expect(isTimerChoice(null)).toBe(true);
    expect(isTimerChoice(45)).toBe(false);
    expect(isTimerChoice('15')).toBe(false);
  });

  it('ends on the wall clock and counts whole minutes left, rounded up', () => {
    const endsAt = timerEndsAt(NOW, 15);
    expect(endsAt).toBe(NOW + 15 * MINUTE);
    expect(minutesLeft(endsAt, NOW)).toBe(15);
    expect(minutesLeft(endsAt, NOW + 30_000)).toBe(15);
    expect(minutesLeft(endsAt, endsAt - 1)).toBe(1);
    expect(minutesLeft(endsAt, endsAt + MINUTE)).toBe(0);
  });
});

describe('sleepSteps', () => {
  it('holds full level, then fades to 0 over the last 30 s, on the audio clock', () => {
    const steps = sleepSteps(NOW + 15 * MINUTE, NOW, 100, 1);
    const end = 100 + 15 * 60;
    expect(steps).toEqual([
      { kind: 'set', value: 1, time: end - FADE_SECONDS },
      { kind: 'linear', value: 0, time: end },
    ]);
    const param = curve(1, 100, steps);
    expect(param.valueAt(end - 30)).toBe(1);
    expect(param.valueAt(end - 15)).toBeCloseTo(0.5, 9);
    expect(param.valueAt(end)).toBe(0);
  });

  it('from a lowered value (a timer moved during its fade), comes back up over 3 s, never at once', () => {
    const steps = sleepSteps(NOW + 15 * MINUTE, NOW, 100, 0.2);
    const param = curve(0.2, 100, steps);
    expect(param.valueAt(100)).toBeCloseTo(0.2, 9);
    expect(param.valueAt(100 + RECOVER_SECONDS / 2)).toBeCloseTo(0.6, 9);
    expect(param.valueAt(100 + RECOVER_SECONDS)).toBe(1);
  });

  it('inside the last 30 s, starts from the value the fade has reached, or lower, and ends on time', () => {
    const endsAt = NOW + 10_000; // 10 s left: the fade would be at 1/3
    const fresh = curve(1, 50, sleepSteps(endsAt, NOW, 50, 1));
    expect(fresh.valueAt(50)).toBeCloseTo(1 / 3, 9);
    expect(fresh.valueAt(60)).toBe(0);
    const lower = curve(0.1, 50, sleepSteps(endsAt, NOW, 50, 0.1));
    expect(lower.valueAt(50)).toBeCloseTo(0.1, 9);
    expect(lower.valueAt(55)).toBeCloseTo(0.05, 9);
  });

  it('a timer that has already ended goes to 0 at once', () => {
    const param = curve(1, 50, sleepSteps(NOW - 1, NOW, 50, 1));
    expect(param.valueAt(50)).toBe(0);
  });

  it('never rises above the held value except the 3 s recovery before a later fade', () => {
    for (const current of [0, 0.3, 1]) {
      for (const secondsLeft of [5, 29, 31, 32, 34, 600]) {
        const param = curve(current, 0, sleepSteps(NOW + secondsLeft * 1000, NOW, 0, current));
        const recovers = secondsLeft - FADE_SECONDS >= RECOVER_SECONDS;
        for (let t = 0; t <= secondsLeft; t += 0.25) {
          const value = param.valueAt(t);
          if (!recovers) expect(value).toBeLessThanOrEqual(current + 1e-9);
          else if (t < RECOVER_SECONDS) expect(value).toBeLessThanOrEqual(current + (1 - current) * (t / RECOVER_SECONDS) + 1e-9);
        }
        expect(param.valueAt(secondsLeft)).toBe(0);
      }
    }
  });

  it('with no timer, recovers to full over 3 s; at full, does nothing', () => {
    expect(recoverSteps(10, 0.4)).toEqual([{ kind: 'linear', value: 1, time: 13 }]);
    expect(recoverSteps(10, 1)).toEqual([]);
  });
});
