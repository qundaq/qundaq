/** The clock and timers whenReached uses; tests pass their own to make a timer fire early. */
export interface Timers {
  now: () => number;
  set: (callback: () => void, delay: number) => unknown;
  clear: (handle: unknown) => void;
}

const BROWSER: Timers = {
  now: () => Date.now(),
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Calls `done` with the time once the clock has reached `at`. A timer may fire a little early (browsers do
 * it by a millisecond or so), so each firing checks the clock and waits again for what is left. Returns
 * a cancel function.
 */
export function whenReached(
  at: number,
  done: (now: number) => void,
  timers: Timers = BROWSER,
): () => void {
  let handle: unknown;
  const check = () => {
    const now = timers.now();
    if (now >= at) done(now);
    else handle = timers.set(check, at - now);
  };
  handle = timers.set(check, Math.max(0, at - timers.now()));
  return () => timers.clear(handle);
}
