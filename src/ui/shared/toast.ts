export interface ToastRequest {
  message: string;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
  tone?: 'ok' | 'info';
}
export interface ToastItem extends ToastRequest {
  id: number;
  durationMs: number;
}
export const TOAST_DEFAULT_MS = 5000;
export const TOAST_UNDO_MS = 8000; // long enough to reach the undo action (common.undo) with a thumb, short enough not to linger

/** One toast at a time: a new request replaces the current one and restarts the clock. */
export function nextToast(current: ToastItem | null, request: ToastRequest): ToastItem {
  return {
    ...request,
    id: (current?.id ?? 0) + 1,
    durationMs: request.durationMs ?? TOAST_DEFAULT_MS,
  };
}

export type HoldReason = 'focus' | 'pointer';

export interface DismissTimer {
  /** Stops the clock while the toast has focus or the pointer is over it (WCAG 2.2.1), so its action can be reached. */
  hold: (reason: HoldReason) => void;
  /** Lets go of one reason; with none left, the clock runs on with the time that was left. */
  release: (reason: HoldReason) => void;
  cancel: () => void;
}

/** A toast's auto-dismiss clock: `onExpire` runs once, `durationMs` of unheld time after the start. */
export function dismissTimer(durationMs: number, onExpire: () => void): DismissTimer {
  const held = new Set<HoldReason>();
  let left = durationMs;
  let startedAt = 0;
  let handle: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const run = () => {
    startedAt = Date.now();
    handle = setTimeout(() => {
      done = true;
      onExpire();
    }, left);
  };
  const stop = () => {
    if (handle === null) return;
    clearTimeout(handle);
    handle = null;
    left = Math.max(0, left - (Date.now() - startedAt));
  };
  run();

  return {
    hold(reason) {
      if (done) return;
      held.add(reason);
      stop();
    },
    release(reason) {
      if (done || !held.delete(reason) || held.size > 0) return;
      run();
    },
    cancel() {
      done = true;
      stop();
    },
  };
}
