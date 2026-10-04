import { useId } from 'react';
import type { PumpReport } from '../../domain/summary';
import { useLocale, useT } from '../app/I18nProvider';
import { Card } from '../shared/Card';
import { formatNumber } from '../history/describe';
import { pumpSessionsText } from '../history/PumpReportCard';
import styles from './Summary.module.css';

/**
 * The pumping card of the shown day: its sessions, total and sides (when the day has any pump),
 * then the 7 days ending on it. Nothing at all when the 7 days have no pump.
 */
export function PumpCard({ day, week }: { day: PumpReport; week: PumpReport }) {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  if (week.sessions === 0) return null;
  const ml = (value: number) => formatNumber(locale, value);
  return (
    <Card as="section" data-testid="summary-pump" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.cardTitle}>
        {t('pump.report.title')}
      </h2>
      {day.sessions > 0 && (
        <>
          <p>{pumpSessionsText(t, locale, day.sessions)}</p>
          <p>{t('pump.report.total', { ml: ml(day.totalMl) })}</p>
          <p>{t('pump.report.sides', { l: ml(day.leftMl), r: ml(day.rightMl) })}</p>
        </>
      )}
      <p>{t('pump.report.week', { ml: ml(week.totalMl) })}</p>
      <p>{t('pump.report.average', { ml: ml(week.averagePerDay) })}</p>
    </Card>
  );
}
