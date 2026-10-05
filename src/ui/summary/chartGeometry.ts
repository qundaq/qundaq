import type { GrowthPoint } from '../../domain/summary';

export interface ChartGeometry {
  /** One dot per measurement, in viewBox units, oldest first. */
  dots: { x: number; y: number }[];
  /** The SVG `points` attribute of the line, or null with fewer than two measurements. */
  polyline: string | null;
  /** The values at the top and the bottom of the y axis. */
  yMax: number;
  yMin: number;
  /** The times at the two ends of the x axis: the first and the last measurement. */
  firstAt: number | null;
  lastAt: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Lays measurements out in a width × height viewBox with `padding` on every side. x is proportional to
 * time and y runs from the smallest value (bottom) to the largest (top). A single point, or a series with
 * one time or one value, sits in the middle of that axis.
 */
export function growthChartGeometry(
  points: readonly GrowthPoint[],
  width: number,
  height: number,
  padding: number,
): ChartGeometry {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last)
    return { dots: [], polyline: null, yMax: 0, yMin: 0, firstAt: null, lastAt: null };
  const values = sorted.map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const innerWidth = width - 2 * padding;
  const innerHeight = height - 2 * padding;
  const x = (at: number) =>
    last.at === first.at
      ? padding + innerWidth / 2
      : padding + ((at - first.at) / (last.at - first.at)) * innerWidth;
  const y = (value: number) =>
    yMax === yMin
      ? padding + innerHeight / 2
      : padding + ((yMax - value) / (yMax - yMin)) * innerHeight;
  const dots = sorted.map((point) => ({ x: round(x(point.at)), y: round(y(point.value)) }));
  return {
    dots,
    polyline: dots.length >= 2 ? dots.map((dot) => `${dot.x},${dot.y}`).join(' ') : null,
    yMax,
    yMin,
    firstAt: first.at,
    lastAt: last.at,
  };
}

/** Room for a bold 12 px tabular digit, in px (wide enough for the fallback fonts of Linux WebKit). */
const DIGIT_PX = 8.5;
const MIN_AXIS_PX = 18;
const MAX_AXIS_PX = 44;

/** The width of a value axis column: the widest tick label's characters, never under 18 px nor over 44 px. */
export function axisWidthPx(labels: readonly (string | number)[]): number {
  const chars = Math.max(0, ...labels.map((label) => String(label).length));
  return Math.min(MAX_AXIS_PX, Math.max(MIN_AXIS_PX, Math.ceil(chars * DIGIT_PX) + 3));
}
