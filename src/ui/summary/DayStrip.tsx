import type { DaySchedule } from '../../domain/dayStrip';
import type { Id } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { useT } from '../app/I18nProvider';
import { Card } from '../shared/Card';
import { cx } from '../shared/cx';
import { formatDuration } from '../shared/format';
import styles from './Summary.module.css';

export interface DayStripBaby {
  id: Id;
  name: string;
  color: string;
  sleepMs: number;
  feeds: number;
  schedule: DaySchedule;
}

const AXIS_HOURS = [0, 6, 12, 18, 24];

/** The shown day, 00:00–24:00, as one timeline per baby on a shared axis. */
export function DayStrip({
  babies,
  nowPct,
}: {
  babies: readonly DayStripBaby[];
  nowPct: number | null;
}) {
  const t = useT();
  const summary = babies
    .map((baby) =>
      t('summary.dayStrip.summary', {
        name: baby.name,
        sleep: formatDuration(t, baby.sleepMs),
        feeds: baby.feeds,
      }),
    )
    .join(' · ');
  return (
    <Card as="section" aria-label={summary}>
      <h2 className={styles.cardTitle}>{t('summary.dayStrip.title')}</h2>
      {babies.map((baby) => (
        <div key={baby.id} className={styles.stripRow}>
          {babies.length > 1 && (
            <span className={styles.stripName}>
              <span
                className={styles.babyDot}
                style={{ background: resolveBabyColor(baby.color) }}
                aria-hidden="true"
              />
              {baby.name}
            </span>
          )}
          <div className={styles.strip}>
            {baby.schedule.sleep.map((interval, i) => (
              <div
                key={i}
                className={styles.stripSleep}
                data-testid="strip-sleep"
                style={{
                  left: `${interval.startPct * 100}%`,
                  width: `${(interval.endPct - interval.startPct) * 100}%`,
                }}
              />
            ))}
            {baby.schedule.feedMarks.map((pct, i) => (
              <div
                key={i}
                className={styles.stripFeed}
                data-testid="strip-feed"
                style={{ left: `${pct * 100}%` }}
              />
            ))}
            {nowPct !== null && (
              <div
                className={styles.stripNow}
                data-testid="now-tick"
                style={{ left: `${nowPct * 100}%` }}
              />
            )}
          </div>
        </div>
      ))}
      {/* Only multiple babies get a name column; the axis lines up under the strips either way. */}
      <div
        className={cx(styles.stripAxis, babies.length > 1 && styles.stripAxisIndented)}
        aria-hidden="true"
      >
        {AXIS_HOURS.map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}</span>
        ))}
      </div>
      <div className={styles.stripLegend} aria-hidden="true">
        <span className={styles.stripLegendSleep}>{t('summary.dayStrip.sleep')}</span>
        <span className={styles.stripLegendFeed}>{t('summary.dayStrip.feeds')}</span>
      </div>
    </Card>
  );
}
