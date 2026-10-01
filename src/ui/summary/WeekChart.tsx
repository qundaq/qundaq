import type { DailyTotals } from '../../domain/summary';
import { MINUTE } from '../../domain/time';
import { useLocale, useT } from '../app/I18nProvider';
import { weekdayShort } from '../history/describe';
import { Card } from '../shared/Card';
import { formatDuration } from '../shared/format';
import { Segmented } from '../shared/Segmented';
import { niceCeiling, weekAxis } from './dashboardModel';
import styles from './Summary.module.css';

export type Metric = 'sleep' | 'feeding';

/**
 * The `summary.week` card ("Last 7 days"): a Sleep/Feeding switch over the seven days ending on the
 * shown day, oldest first. The switch is controlled by the caller, whose state outlives this card's
 * remounts while another day or baby loads.
 */
export function WeekChart({
  week,
  today,
  metric,
  onMetric,
}: {
  week: readonly { dayStart: number; totals: DailyTotals }[];
  today: number;
  metric: Metric;
  onMetric: (metric: Metric) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const chronological = [...week].reverse();

  return (
    <Card>
      <h2 className={styles.cardTitle}>{t('summary.week')}</h2>
      <Segmented
        label={t('summary.week.metric')}
        hideLabel
        value={metric}
        onChange={onMetric}
        options={[
          { value: 'sleep', label: t('summary.week.metric.sleep') },
          { value: 'feeding', label: t('summary.week.metric.feeding') },
        ]}
      />
      {metric === 'sleep' ? (
        <SleepBars week={chronological} today={today} locale={locale} />
      ) : (
        <FeedingBars week={chronological} today={today} locale={locale} t={t} />
      )}
    </Card>
  );
}

function SleepBars({
  week,
  today,
  locale,
}: {
  week: readonly { dayStart: number; totals: DailyTotals }[];
  today: number;
  locale: ReturnType<typeof useLocale>;
}) {
  const t = useT();
  const values = week.map((day) => day.totals.sleepMs);
  const ceiling = niceCeiling(Math.max(...values, 0));
  if (ceiling === 0) return <p className={styles.muted}>{t('summary.week.empty')}</p>;
  // The bars' text alternative, from the same totals they draw.
  const summary = week
    .map((day) => `${weekdayShort(locale, day.dayStart)} ${formatDuration(t, day.totals.sleepMs)}`)
    .join(', ');
  return (
    <div className={styles.bars} role="img" aria-label={summary}>
      {week.map((day) => {
        const isToday = day.dayStart === today;
        return (
          <div key={day.dayStart} className={styles.bar} data-testid="week-bar">
            <div
              className={isToday ? styles.barFillToday : styles.barFill}
              style={{ height: `${Math.min(100, (day.totals.sleepMs / ceiling) * 100)}%` }}
            />
            <span className={isToday ? styles.barLabelToday : styles.barLabel}>
              {weekdayShort(locale, day.dayStart)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FeedingBars({
  week,
  today,
  locale,
  t,
}: {
  week: readonly { dayStart: number; totals: DailyTotals }[];
  today: number;
  locale: ReturnType<typeof useLocale>;
  t: ReturnType<typeof useT>;
}) {
  const minutes = week.map((day) => Math.round(day.totals.breastMs / MINUTE));
  const ml = week.map((day) => day.totals.bottleMl);
  const leftAxis = weekAxis(minutes);
  const rightAxis = weekAxis(ml);
  if (!leftAxis && !rightAxis) return <p className={styles.muted}>{t('summary.week.empty')}</p>;
  const leftMax = leftAxis?.[2] ?? 0;
  const rightMax = rightAxis?.[2] ?? 0;
  // The bars' text alternative, from the same totals they draw.
  const summary = week
    .map(
      (day) =>
        `${weekdayShort(locale, day.dayStart)} ${formatDuration(t, day.totals.breastMs)} · ${t('unit.ml', { ml: day.totals.bottleMl })}`,
    )
    .join(', ');
  return (
    <div role="img" aria-label={summary}>
      <div className={styles.chartRow}>
        {leftAxis && (
          <div className={styles.axisLeft} data-testid="week-axis-left">
            <span>{leftAxis[2]}</span>
            <span>{leftAxis[1]}</span>
            <span>{leftAxis[0]}</span>
          </div>
        )}
        <div className={styles.dualBars}>
          {week.map((day, i) => (
            <div key={day.dayStart} className={styles.dualBar} data-testid="week-dual-bar">
              <div
                className={styles.dualBarMinutes}
                style={{
                  height: `${leftMax > 0 ? Math.min(100, (minutes[i]! / leftMax) * 100) : 0}%`,
                }}
              />
              <div
                className={styles.dualBarMl}
                style={{
                  height: `${rightMax > 0 ? Math.min(100, (ml[i]! / rightMax) * 100) : 0}%`,
                }}
              />
            </div>
          ))}
        </div>
        {rightAxis && (
          <div className={styles.axisRight} data-testid="week-axis-right">
            <span>{rightAxis[2]}</span>
            <span>{rightAxis[1]}</span>
            <span>{rightAxis[0]}</span>
          </div>
        )}
      </div>
      {/* The same three parts as the row above, a spacer standing in for each drawn axis. */}
      <div className={styles.dualLabels}>
        {leftAxis && <div className={styles.dualLabelsSpacer} />}
        <div className={styles.dualLabelsBars}>
          {week.map((day) => (
            <span
              key={day.dayStart}
              className={day.dayStart === today ? styles.barLabelToday : styles.barLabel}
            >
              {weekdayShort(locale, day.dayStart)}
            </span>
          ))}
        </div>
        {rightAxis && <div className={styles.dualLabelsSpacer} />}
      </div>
    </div>
  );
}
