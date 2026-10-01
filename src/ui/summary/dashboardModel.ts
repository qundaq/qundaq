import { formatDuration } from '../shared/format';
import type { TranslateFn } from '../app/I18nProvider';

export type TileKind = 'duration' | 'count' | 'ml';

/** A tile's own value and its diff line share this one formatting path, so they never disagree. */
export function formatTileValue(t: TranslateFn, kind: TileKind, value: number): string {
  switch (kind) {
    case 'duration':
      return formatDuration(t, value);
    case 'ml':
      return t('unit.ml', { ml: value });
    case 'count':
      return String(value);
  }
}

/**
 * A tile's comparison to the day right before it, or null when there is nothing to compare (both
 * days are exactly zero — a "0 fark" line would be noise, not information). The comparison is
 * always on the raw total (ms/count/ml), never on the formatted text, so two different totals that
 * happen to format the same are still told apart.
 */
export function tileDiffText(
  t: TranslateFn,
  kind: TileKind,
  current: number,
  previous: number,
): string | null {
  if (current === 0 && previous === 0) return null;
  if (current === previous)
    return t(`summary.diff.same.${kind}`, { value: formatTileValue(t, kind, current) });
  const diff = Math.abs(current - previous);
  const sign = current > previous ? '+' : '−'; // a true minus, never a hyphen next to a number
  return t(`summary.diff.${kind}`, { sign, value: formatTileValue(t, kind, diff) });
}

const NICE_STEPS = [1, 2, 5];

/** The smallest 1/2/5 × 10ⁿ number at or above `value` (0 stays 0). */
export function niceCeiling(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of NICE_STEPS) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Three axis ticks for a week of values — 0, half of the nice ceiling of the max, and the ceiling
 * itself — matched to the chart's three evenly-spaced tick positions (bottom/middle/top: a flex
 * column with `justify-content: space-between` puts 3 items at 0/50/100%, so the middle tick must
 * be exactly half the top tick, not two-thirds of it). Null when every value is zero (an "0/0/0"
 * axis would look broken, not empty).
 */
export function weekAxis(values: readonly number[]): readonly [number, number, number] | null {
  const max = Math.max(...values, 0);
  if (max <= 0) return null;
  const ceiling = niceCeiling(max);
  return [0, Math.round(ceiling / 2), ceiling];
}
