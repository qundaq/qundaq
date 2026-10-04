import type { PumpReport } from '../../domain/summary';
import { useId } from 'react';
import { useLocale, useT, type TranslateFn } from '../app/I18nProvider';
import { Card } from '../shared/Card';
import { formatNumber } from './describe';
import styles from './Log.module.css';

/** "1 session" or "{n} sessions", the singular having its own text. */
export function pumpSessionsText(
  t: TranslateFn,
  locale: Parameters<typeof formatNumber>[0],
  n: number,
) {
  return n === 1
    ? t('pump.report.sessions.one')
    : t('pump.report.sessions', { n: formatNumber(locale, n) });
}

/** The pumping filter's report for the range shown: nothing at all when no pump started in it. */
export function PumpReportCard({
  report,
  multiDay,
}: {
  report: PumpReport;
  /** A range of 2+ days also shows the daily average. */
  multiDay: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const titleId = useId();
  if (report.sessions === 0) return null;
  const ml = (value: number) => formatNumber(locale, value);
  return (
    <Card
      as="section"
      className={styles.pumpReport}
      data-testid="pump-report"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{t('pump.report.title')}</h2>
      <p>{pumpSessionsText(t, locale, report.sessions)}</p>
      <p>{t('pump.report.total', { ml: ml(report.totalMl) })}</p>
      <p>{t('pump.report.sides', { l: ml(report.leftMl), r: ml(report.rightMl) })}</p>
      {multiDay && <p>{t('pump.report.average', { ml: ml(report.averagePerDay) })}</p>}
    </Card>
  );
}
