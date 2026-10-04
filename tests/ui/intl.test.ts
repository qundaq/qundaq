import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateTimeFormat, numberFormat } from '../../src/ui/shared/intl';
import { clockTime, formatNumber, shortDate, weekdayShort } from '../../src/ui/history/describe';

afterEach(() => {
  vi.restoreAllMocks();
});

const DATES = [
  new Date(2026, 0, 1, 0, 5).getTime(),
  new Date(2026, 8, 27, 23, 59).getTime(),
  new Date(2025, 11, 31, 12, 0).getTime(),
];

describe('cached Intl formatters', () => {
  it('format exactly as a freshly built formatter does', () => {
    for (const locale of ['tr', 'en'] as const) {
      for (const ms of DATES) {
        expect(clockTime(locale, ms)).toBe(
          new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(ms),
        );
        expect(shortDate(locale, ms)).toBe(
          new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms),
        );
        expect(weekdayShort(locale, ms)).toBe(
          new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(ms),
        );
      }
      expect(formatNumber(locale, 1234.5, 1)).toBe(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(1234.5),
      );
    }
  });

  it('build one formatter per locale and options, then reuse it', () => {
    const dates = vi.spyOn(Intl, 'DateTimeFormat');
    const numbers = vi.spyOn(Intl, 'NumberFormat');
    const options = { day: 'numeric', month: 'long', year: '2-digit' } as const;
    const first = dateTimeFormat('en', options);
    // The spy sees constructions: this key is new, so it was built just now.
    expect(dates).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) {
      expect(dateTimeFormat('en', { ...options })).toBe(first);
      clockTime('tr', DATES[i % DATES.length]!);
      formatNumber('tr', i);
    }
    expect(dateTimeFormat('tr', options)).not.toBe(first);
    expect(dates.mock.calls.length).toBeLessThanOrEqual(3);
    expect(numbers.mock.calls.length).toBeLessThanOrEqual(1);
    expect(numberFormat('en', { maximumFractionDigits: 3 })).toBe(
      numberFormat('en', { maximumFractionDigits: 3 }),
    );
  });
});
