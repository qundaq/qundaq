import { describe, expect, it } from 'vitest';
import { whenReached, type Timers } from '../../src/ui/shared/whenReached';

/** Timers driven by hand: `fire` runs the pending callback at whatever time the test sets. */
function manualTimers(start: number) {
  let time = start;
  let pending: { callback: () => void; delay: number } | null = null;
  const delays: number[] = [];
  const timers: Timers = {
    now: () => time,
    set: (callback, delay) => {
      pending = { callback, delay };
      delays.push(delay);
      return pending;
    },
    clear: (handle) => {
      if (handle === pending) pending = null;
    },
  };
  return {
    timers,
    delays,
    pending: () => pending,
    fireAt(at: number) {
      time = at;
      const due = pending!;
      pending = null;
      due.callback();
    },
  };
}

describe('whenReached', () => {
  it('waits again when its timer fires early, and only then calls back', () => {
    const clock = manualTimers(1000);
    const calls: number[] = [];
    whenReached(3000, (now) => calls.push(now), clock.timers);
    expect(clock.delays).toEqual([2000]);
    // The browser fires a millisecond early: still inside the window, so no call, and a retry for the 1 ms left.
    clock.fireAt(2999);
    expect(calls).toEqual([]);
    expect(clock.delays).toEqual([2000, 1]);
    clock.fireAt(3000);
    expect(calls).toEqual([3000]);
    expect(clock.pending()).toBeNull();
  });

  it('calls back on the first firing when the time has already passed', () => {
    const clock = manualTimers(5000);
    const calls: number[] = [];
    whenReached(3000, (now) => calls.push(now), clock.timers);
    expect(clock.delays).toEqual([0]);
    clock.fireAt(5000);
    expect(calls).toEqual([5000]);
  });

  it('cancels whichever timer is pending, the retry included', () => {
    const clock = manualTimers(1000);
    const calls: number[] = [];
    const cancel = whenReached(3000, (now) => calls.push(now), clock.timers);
    clock.fireAt(2990);
    expect(clock.pending()).not.toBeNull();
    cancel();
    expect(clock.pending()).toBeNull();
    expect(calls).toEqual([]);
  });
});
