import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { nextToast, TOAST_DEFAULT_MS } from '../../src/ui/shared/toast';
import { ToastProvider } from '../../src/ui/shared/ToastBanner';

describe('nextToast', () => {
  it('replaces the current toast with a higher id and the default duration', () => {
    const first = nextToast(null, { message: 'a' });
    expect(first).toEqual({ id: 1, message: 'a', durationMs: TOAST_DEFAULT_MS });
    const second = nextToast(first, { message: 'b', durationMs: 2000 });
    expect(second.id).toBe(2);
    expect(second.durationMs).toBe(2000);
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
