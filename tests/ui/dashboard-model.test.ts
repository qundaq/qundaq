import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from '../../src/domain/time';
import { translate, type MessageKey } from '../../src/i18n';
import {
  formatTileValue,
  niceCeiling,
  tileDiffText,
  weekAxis,
} from '../../src/ui/summary/dashboardModel';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);

describe('tileDiffText', () => {
  it('is null when both days are exactly zero: nothing to compare', () => {
    expect(tileDiffText(t, 'count', 0, 0)).toBeNull();
    expect(tileDiffText(t, 'duration', 0, 0)).toBeNull();
    expect(tileDiffText(t, 'ml', 0, 0)).toBeNull();
  });

  it('says "the same" when equal and non-zero', () => {
    expect(tileDiffText(t, 'count', 6, 6)).toBe(
      t('summary.diff.same.count', { value: formatTileValue(t, 'count', 6) }),
    );
    expect(tileDiffText(t, 'ml', 90, 90)).toBe(
      t('summary.diff.same.ml', { value: formatTileValue(t, 'ml', 90) }),
    );
    expect(tileDiffText(t, 'duration', 40 * MINUTE, 40 * MINUTE)).toBe(
      t('summary.diff.same.duration', { value: formatTileValue(t, 'duration', 40 * MINUTE) }),
    );
  });

  it('reads the absolute difference with a sign, per kind', () => {
    expect(tileDiffText(t, 'count', 7, 6)).toBe(
      t('summary.diff.count', { sign: '+', value: formatTileValue(t, 'count', 1) }),
    );
    expect(tileDiffText(t, 'count', 5, 6)).toBe(
      t('summary.diff.count', { sign: '−', value: formatTileValue(t, 'count', 1) }),
    );
    expect(tileDiffText(t, 'ml', 60, 120)).toBe(
      t('summary.diff.ml', { sign: '−', value: formatTileValue(t, 'ml', 60) }),
    );
    expect(tileDiffText(t, 'duration', HOUR + 40 * MINUTE, HOUR)).toBe(
      t('summary.diff.duration', { sign: '+', value: formatTileValue(t, 'duration', 40 * MINUTE) }),
    );
  });

  it('is a full diff, not "the same", when one day is zero and the other is not', () => {
    expect(tileDiffText(t, 'count', 5, 0)).toBe(
      t('summary.diff.count', { sign: '+', value: formatTileValue(t, 'count', 5) }),
    );
    expect(tileDiffText(t, 'count', 0, 5)).toBe(
      t('summary.diff.count', { sign: '−', value: formatTileValue(t, 'count', 5) }),
    );
  });
});

describe('niceCeiling', () => {
  it('rounds up to the smallest 1/2/5 × 10ⁿ step at or above the value', () => {
    expect(niceCeiling(0)).toBe(0);
    expect(niceCeiling(1)).toBe(1);
    expect(niceCeiling(13)).toBe(20);
    expect(niceCeiling(37)).toBe(50);
    expect(niceCeiling(45)).toBe(50);
    expect(niceCeiling(88)).toBe(100);
    expect(niceCeiling(120)).toBe(200);
    expect(niceCeiling(121)).toBe(200);
  });
});

describe('weekAxis', () => {
  it('is null when every value is zero: no axis to draw', () => {
    expect(weekAxis([0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('gives three ticks at zero, half the nice ceiling of the max, and the ceiling', () => {
    // max is 40; niceCeiling(40) = 50 (10 and 20 are both below 40, 50 is the first step at or above it).
    // The chart spaces its three ticks evenly (bottom/middle/top), so the middle one is exactly half.
    expect(weekAxis([10, 40, 0, 25, 13, 5, 30])).toEqual([0, 25, 50]);
  });
});
