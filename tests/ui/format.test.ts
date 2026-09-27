import { describe, expect, it } from 'vitest';
import { translate } from '../../src/i18n';
import { HOUR, MINUTE } from '../../src/domain/time';
import { brandDate, formatAgo, formatDuration } from '../../src/ui/shared/format';

const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('tr', key, vars);
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

describe('formatDuration', () => {
  it('shows minutes under an hour and hours + minutes above', () => {
    expect(formatDuration(tr, 0)).toBe(tr('time.minutes', { m: 0 }));
    expect(formatDuration(tr, 45 * MINUTE)).toBe(tr('time.minutes', { m: 45 }));
    expect(formatDuration(tr, 2 * HOUR + 15 * MINUTE)).toBe(
      tr('time.hoursMinutes', { h: 2, m: 15 }),
    );
    expect(formatDuration(en, 2 * HOUR + 15 * MINUTE)).toBe('2 h 15 min');
  });

  it('shows days and hours from 24 hours on', () => {
    expect(formatDuration(tr, 23 * HOUR + 59 * MINUTE)).toBe(
      tr('time.hoursMinutes', { h: 23, m: 59 }),
    );
    expect(formatDuration(tr, 27 * HOUR + 15 * MINUTE)).toBe(tr('time.daysHours', { d: 1, h: 3 }));
    expect(formatDuration(en, 27 * HOUR + 15 * MINUTE)).toBe('1 d 3 h');
    expect(formatDuration(tr, 48 * HOUR)).toBe(tr('time.daysHours', { d: 2, h: 0 }));
  });
});

describe('formatAgo', () => {
  it('says "just now" under a minute', () => {
    expect(formatAgo(tr, 30_000)).toBe(tr('time.justNow'));
    expect(formatAgo(en, 0)).toBe('just now');
  });

  it('otherwise says "<duration> ago"', () => {
    expect(formatAgo(tr, 10 * MINUTE)).toBe(
      tr('time.ago', { duration: tr('time.minutes', { m: 10 }) }),
    );
    expect(formatAgo(en, HOUR)).toBe('1 h 0 min ago');
  });
});

describe('brandDate', () => {
  it('shows the weekday and the short date', () => {
    const sat = new Date(2026, 8, 26, 10).getTime();
    expect(brandDate('en', sat)).toBe('Saturday, Sep 26');
    // tr: weekday first, then day+month — not ICU's default combined order (day month weekday), which is
    // exactly why brandDate composes two separate Intl calls instead of one with both options.
    const trWeekday = new Intl.DateTimeFormat('tr', { weekday: 'long' }).format(sat);
    const combinedOrder = new Intl.DateTimeFormat('tr', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(sat);
    expect(brandDate('tr', sat).startsWith(`${trWeekday}, `)).toBe(true);
    expect(brandDate('tr', sat)).not.toBe(combinedOrder);
  });
});
