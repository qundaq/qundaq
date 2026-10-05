import { useId } from 'react';
import type { PumpReport } from '../../domain/summary';
import { useLocale, useT } from '../app/I18nProvider';
import { Card } from '../shared/Card';
import {
  PumpLine,
  pumpAmountText,
  pumpSessionsText,
  pumpTotalsLines,
} from '../history/PumpReportCard';
import styles from './Summary.module.css';

/**
 * The pumping card of the shown day: its sessions, then its totals and sides in minutes (and ml once any
 * were logged) when the day has a finished pump; then the 7 days ending on it. Nothing at all when the 7
 * days have no finished pump.
 */
export function PumpCard({ day, week }: { day: PumpReport; week: PumpReport }) {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  if (week.sessions === 0) return null;
  return (
    <Card as="section" data-testid="summary-pump" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.cardTitle}>
        {t('pump.report.title')}
      </h2>
      {day.sessions > 0 && (
        <>
          <p>{pumpSessionsText(t, locale, day.sessions)}</p>
          {pumpTotalsLines(t, locale, day).map((line) => (
            <PumpLine key={line} text={line} />
          ))}
        </>
      )}
      <PumpLine
        text={t('pump.report.week', { amount: pumpAmountText(t, locale, week, 'total') })}
      />
      <PumpLine
        text={t('pump.report.average', { amount: pumpAmountText(t, locale, week, 'average') })}
      />
    </Card>
  );
}
