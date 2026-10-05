import type { DailyTotals, PumpReport } from '../../domain/summary';
import { MINUTE } from '../../domain/time';
import { formatDuration } from '../shared/format';
import type { TranslateFn } from '../app/I18nProvider';

export type TileKind = 'duration' | 'minutes' | 'count' | 'ml';

/** A tile's own value and its diff line share this one formatting path, so they never disagree. */
export function formatTileValue(t: TranslateFn, kind: TileKind, value: number): string {
  switch (kind) {
    case 'duration':
      return formatDuration(t, value);
    case 'minutes':
      return t('time.minutes', { m: value });
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

/** A day's breastfeeding time in whole minutes: always minutes, never hours ("90 min", "130 min"). */
export function breastMinutes(ms: number): number {
  return Math.round(ms / MINUTE);
}

/** A tile's value and its diff line (null: no line). The value's parts show as one line that wraps only between them. */
export interface TileText {
  parts: readonly string[];
  diff: string | null;
}

/**
 * The breastfeeding tile: the day's breastfeeds and, beside them, the minutes at the breast — "5" and
 * "(90 min)" — with the diff on those minutes (what the parents follow). With no breastfeed starting that
 * day, a feed carried over from before midnight reads as its minutes alone ("20 min"); a day with nothing
 * reads "0", unless the day before had minutes, where the diff needs the full "0 (0 min)".
 */
export function breastfeedTile(
  t: TranslateFn,
  totals: Pick<DailyTotals, 'feeds' | 'bottles' | 'breastMs'>,
  previous: Pick<DailyTotals, 'breastMs'>,
): TileText {
  const breastfeeds = totals.feeds - totals.bottles;
  const minutes = breastMinutes(totals.breastMs);
  const diff = tileDiffText(t, 'minutes', minutes, breastMinutes(previous.breastMs));
  const full = [
    formatTileValue(t, 'count', breastfeeds),
    t('summary.tile.breastfeed.minutes', { m: minutes }),
  ];
  if (breastfeeds > 0) return { parts: full, diff };
  if (minutes > 0) return { parts: [formatTileValue(t, 'minutes', minutes)], diff };
  return { parts: diff === null ? [formatTileValue(t, 'count', 0)] : full, diff };
}

/** The bottle tile: the day's bottles with their ml ("3 (240 ml)"), the diff on the ml. */
export function bottleTile(
  t: TranslateFn,
  totals: Pick<DailyTotals, 'bottles' | 'bottleMl'>,
  previous: Pick<DailyTotals, 'bottleMl'>,
): TileText {
  const diff = tileDiffText(t, 'ml', totals.bottleMl, previous.bottleMl);
  return {
    parts:
      totals.bottles > 0
        ? [
            formatTileValue(t, 'count', totals.bottles),
            t('summary.tile.bottle.ml', { ml: totals.bottleMl }),
          ]
        : [formatTileValue(t, 'ml', totals.bottleMl)],
    diff,
  };
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

export type PumpChartUnit = 'min' | 'ml';

/** The Pumping chart's bars: one value per day of the report, oldest first, in one unit. */
export interface PumpChartSeries {
  unit: PumpChartUnit;
  days: { day: number; value: number }[];
}

/**
 * What the Pumping chart plots: minutes per day when any finished pump of the window has minutes (the
 * unit pumping is tracked in), the ml per day otherwise (a window logged in ml only).
 */
export function pumpChartSeries(report: PumpReport): PumpChartSeries {
  return report.totalMin > 0
    ? { unit: 'min', days: report.perDayMin.map(({ day, min }) => ({ day, value: min })) }
    : { unit: 'ml', days: report.perDay.map(({ day, ml }) => ({ day, value: ml })) };
}
