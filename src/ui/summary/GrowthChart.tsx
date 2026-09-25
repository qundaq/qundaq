import type { GrowthMetric, GrowthPoint } from '../../domain/summary';
import { formatMeasurement, longDate, shortDate } from '../history/describe';
import { useLocale, useT } from '../I18nProvider';
import { growthChartGeometry } from './chartGeometry';

const WIDTH = 320;
const HEIGHT = 200;
const PADDING = 24;

/**
 * An inline SVG line in the baby's color with a dot per measurement, then the measurements as a table.
 * The table is the exact and accessible source; the chart's name summarises it.
 */
export function GrowthChart({ points, metric, color }: { points: readonly GrowthPoint[]; metric: GrowthMetric; color: string }) {
  const t = useT();
  const locale = useLocale();
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return <p className="muted">{t('growth.empty')}</p>;
  const geometry = growthChartGeometry(points, WIDTH, HEIGHT, PADDING);
  const name = t(`growth.metric.${metric}`);
  const format = (value: number) => formatMeasurement(locale, metric, value);
  const summary =
    points.length === 1
      ? t('growth.summaryOne', { metric: name, value: format(first.value) })
      : t('growth.summary', { metric: name, first: format(first.value), last: format(last.value), count: points.length });
  return (
    <>
      <svg className="growth-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
        <line className="chart-axis" x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} />
        <line className="chart-axis" x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} />
        <text className="chart-label" x={PADDING + 4} y={PADDING + 12}>
          {format(geometry.yMax)}
        </text>
        {geometry.yMin !== geometry.yMax && (
          <text className="chart-label" x={PADDING + 4} y={HEIGHT - PADDING - 6}>
            {format(geometry.yMin)}
          </text>
        )}
        {geometry.polyline && <polyline points={geometry.polyline} fill="none" stroke={color} strokeWidth={2} />}
        {geometry.dots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r={4} fill={color} />
        ))}
        <text className="chart-label" x={PADDING} y={HEIGHT - 6}>
          {shortDate(locale, first.at)}
        </text>
        {points.length > 1 && (
          <text className="chart-label" x={WIDTH - PADDING} y={HEIGHT - 6} textAnchor="end">
            {shortDate(locale, last.at)}
          </text>
        )}
      </svg>
      <table className="growth-table" aria-label={t('growth.table')}>
        <thead>
          <tr>
            <th scope="col">{t('growth.col.date')}</th>
            <th scope="col">{name}</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((point, i) => (
            <tr key={`${point.at}-${i}`}>
              <td>{longDate(locale, point.at)}</td>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
