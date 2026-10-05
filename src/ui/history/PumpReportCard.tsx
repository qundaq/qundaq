import type { PumpReport } from '../../domain/summary';
import type { Locale } from '../../i18n';
import { useId } from 'react';
import { useLocale, useT, type TranslateFn } from '../app/I18nProvider';
import { Card } from '../shared/Card';
import { formatNumber } from './describe';
import styles from './Log.module.css';

/** "1 session" or "{n} sessions", the singular having its own text. */
export function pumpSessionsText(t: TranslateFn, locale: Locale, n: number) {
  return n === 1
    ? t('pump.report.sessions.one')
    : t('pump.report.sessions', { n: formatNumber(locale, n) });
}

/**
 * The units a report speaks in: minutes first, and ml as well once any were logged. A report with ml only
 * keeps to ml; one with neither (an imported row with no amounts) still reads in minutes.
 */
export function pumpUnits(report: PumpReport): { min: boolean; ml: boolean } {
  const ml = report.totalMl > 0;
  return { min: report.totalMin > 0 || !ml, ml };
}

const minutesText = (t: TranslateFn, locale: Locale, value: number) =>
  t('time.minutes', { m: formatNumber(locale, value) });
const mlText = (t: TranslateFn, locale: Locale, value: number) =>
  t('unit.ml', { ml: formatNumber(locale, value) });

/**
 * The totals with their sides, one line per unit, minutes first: "Total 95 min · Left 50 min · Right 45
 * min", then "Total 210 ml · Left 150 ml · Right 60 ml" when ml were logged.
 */
export function pumpTotalsLines(t: TranslateFn, locale: Locale, report: PumpReport): string[] {
  const units = pumpUnits(report);
  const lines: string[] = [];
  if (units.min)
    lines.push(
      t('pump.report.totals', {
        total: minutesText(t, locale, report.totalMin),
        l: minutesText(t, locale, report.leftMin),
        r: minutesText(t, locale, report.rightMin),
      }),
    );
  if (units.ml)
    lines.push(
      t('pump.report.totals', {
        total: mlText(t, locale, report.totalMl),
        l: mlText(t, locale, report.leftMl),
        r: mlText(t, locale, report.rightMl),
      }),
    );
  return lines;
}

/** The report's total or its daily average in the units it speaks in: "95 dk", "95 dk · 210 ml", "210 ml". */
export function pumpAmountText(
  t: TranslateFn,
  locale: Locale,
  report: PumpReport,
  which: 'total' | 'average',
): string {
  const units = pumpUnits(report);
  const parts: string[] = [];
  if (units.min)
    parts.push(
      minutesText(t, locale, which === 'total' ? report.totalMin : report.averageMinPerDay),
    );
  if (units.ml)
    parts.push(mlText(t, locale, which === 'total' ? report.totalMl : report.averagePerDay));
  return parts.join(' · ');
}

/**
 * One report line, wrapped on a narrow screen only between its " · " parts, so a number never parts from
 * its unit or its side ("Right 37" / "min").
 */
export function PumpLine({ text }: { text: string }) {
  const parts = text.split(' · ');
  return (
    <p>
      {parts.map((part, i) => (
        <span key={i}>
          <span className={styles.keep}>{part}</span>
          {i < parts.length - 1 && ' · '}
        </span>
      ))}
    </p>
  );
}

/** The pumping filter's report for the range shown: nothing at all when no finished pump started in it. */
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
  return (
    <Card
      as="section"
      className={styles.pumpReport}
      data-testid="pump-report"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{t('pump.report.title')}</h2>
      <p>{pumpSessionsText(t, locale, report.sessions)}</p>
      {pumpTotalsLines(t, locale, report).map((line) => (
        <PumpLine key={line} text={line} />
      ))}
      {multiDay && (
        <PumpLine
          text={t('pump.report.average', { amount: pumpAmountText(t, locale, report, 'average') })}
        />
      )}
    </Card>
  );
}
