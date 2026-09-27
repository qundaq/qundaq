import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  dismissTimer,
  nextToast,
  TOAST_DEFAULT_MS,
  TOAST_UNDO_MS,
} from '../../src/ui/shared/toast';
import { ToastProvider } from '../../src/ui/shared/ToastBanner';

describe('nextToast', () => {
  it('replaces the current toast with a higher id and the default duration', () => {
    const first = nextToast(null, { message: 'a' });
    expect(first).toEqual({ id: 1, message: 'a', durationMs: TOAST_DEFAULT_MS });
    const second = nextToast(first, { message: 'b', durationMs: 2000 });
    expect(second.id).toBe(2);
    expect(second.durationMs).toBe(2000);
  });

  it('an undo toast lasts longer and keeps its tone', () => {
    const undo = nextToast(null, { message: 'x', durationMs: TOAST_UNDO_MS, tone: 'info' });
    expect(TOAST_UNDO_MS).toBe(8000);
    expect(undo).toMatchObject({ durationMs: 8000, tone: 'info' });
  });
});

describe('dismissTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after its duration', () => {
    const expire = vi.fn();
    dismissTimer(8000, expire);
    vi.advanceTimersByTime(7999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('stands still while held (focus or pointer) and resumes with the time that was left', () => {
    const expire = vi.fn();
    const timer = dismissTimer(8000, expire);
    vi.advanceTimersByTime(3000);
    timer.hold('focus');
    timer.hold('pointer');
    vi.advanceTimersByTime(60_000);
    expect(expire).not.toHaveBeenCalled();
    timer.release('pointer');
    vi.advanceTimersByTime(60_000);
    expect(expire).not.toHaveBeenCalled(); // still focused
    timer.release('focus');
    vi.advanceTimersByTime(4999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('a repeated hold or release changes nothing, and cancel stops it for good', () => {
    const expire = vi.fn();
    const timer = dismissTimer(1000, expire);
    timer.release('focus');
    timer.hold('focus');
    timer.hold('focus');
    timer.release('focus');
    vi.advanceTimersByTime(1000);
    expect(expire).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const other = dismissTimer(1000, cancelled);
    other.cancel();
    other.release('pointer');
    vi.advanceTimersByTime(5000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('ToastProvider', () => {
  it('renders a polite live region even while empty, so the first toast is announced', () => {
    const html = renderToStaticMarkup(
      createElement(ToastProvider, null, createElement('p', null, 'x')),
    );
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
  });
});
