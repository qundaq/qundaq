import { describe, expect, it } from 'vitest';
import { translate } from '../../src/i18n';
import { HOUR, MINUTE } from '../../src/domain/time';
import { formatAgo, formatDuration } from '../../src/ui/shared/format';

const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('tr', key, vars);
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);

describe('formatDuration', () => {
  it('shows minutes under an hour and hours + minutes above', () => {
    expect(formatDuration(tr, 0)).toBe('0 dk');
    expect(formatDuration(tr, 45 * MINUTE)).toBe('45 dk');
    expect(formatDuration(tr, 2 * HOUR + 15 * MINUTE)).toBe('2 sa 15 dk');
    expect(formatDuration(en, 2 * HOUR + 15 * MINUTE)).toBe('2 h 15 min');
  });

  it('shows days and hours from 24 hours on', () => {
    expect(formatDuration(tr, 23 * HOUR + 59 * MINUTE)).toBe('23 sa 59 dk');
    expect(formatDuration(tr, 27 * HOUR + 15 * MINUTE)).toBe('1 g 3 sa');
    expect(formatDuration(en, 27 * HOUR + 15 * MINUTE)).toBe('1 d 3 h');
    expect(formatDuration(tr, 48 * HOUR)).toBe('2 g 0 sa');
  });
});

describe('formatAgo', () => {
  it('says "just now" under a minute', () => {
    expect(formatAgo(tr, 30_000)).toBe('az önce');
    expect(formatAgo(en, 0)).toBe('just now');
  });

  it('otherwise says "<duration> ago"', () => {
    expect(formatAgo(tr, 10 * MINUTE)).toBe('10 dk önce');
    expect(formatAgo(en, HOUR)).toBe('1 h 0 min ago');
  });
});
