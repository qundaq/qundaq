import { dayOffset } from '../../domain/days';
import { temperatureAlert } from '../../domain/health';
import { isTimedType } from '../../domain/rules';
import { stoolAlert } from '../../domain/stool';
import type { GrowthMetric } from '../../domain/summary';
import type { EventType, Side, TrackerEvent } from '../../domain/types';
import type { Locale } from '../../i18n';
import { HOUR } from '../../domain/time';
import { formatDuration } from '../format';
import type { TranslateFn } from '../I18nProvider';
import { segmentMinutes } from '../log/drafts';

// Formatters are built per call: Intl captures the time zone when it is constructed.

export function formatNumber(locale: Locale, value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function clockTime(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(ms);
}

export function shortDate(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
}

export function longDate(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(ms);
}

export function weekdayShort(locale: Locale, ms: number): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(ms);
}

/** "Bugün", "Dün", otherwise the weekday with the date. */
export function dayLabel(t: TranslateFn, locale: Locale, dayStart: number, now: number): string {
  const daysAgo = dayOffset(dayStart, now);
  if (daysAgo === 0) return t('day.today');
  if (daysAgo === 1) return t('day.yesterday');
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    dayStart,
  );
}

/** A clock time, marked when it falls on another day than the one shown. */
export function timeOnDay(t: TranslateFn, locale: Locale, ms: number, shownDay: number): string {
  const time = clockTime(locale, ms);
  const offset = dayOffset(shownDay, ms);
  if (offset === 0) return time;
  if (offset === -1) return `${time} ${t('log.suffix.previousDay')}`;
  if (offset === 1) return `${time} ${t('log.suffix.nextDay')}`;
  return `${time} (${shortDate(locale, ms)})`;
}

/** "14:05"; for a timer "22:10 – 06:30" or "22:10 – devam ediyor", each end marked if on another day. */
export function timeRange(
  t: TranslateFn,
  locale: Locale,
  event: TrackerEvent,
  shownDay: number,
): string {
  const start = timeOnDay(t, locale, event.startAt, shownDay);
  if (!isTimedType(event.type)) return start;
  if (event.endAt === undefined) return t('log.range.running', { start });
  return `${start} – ${timeOnDay(t, locale, event.endAt, shownDay)}`;
}

export function typeLabel(t: TranslateFn, type: EventType): string {
  return t(`sheet.${type}.title`);
}

/** The first line of a note, trimmed, at most `max` characters (the last one an ellipsis when cut). */
export function firstLine(text: string, max = 80): string {
  const line = (text.split(/\r?\n/, 1)[0] ?? '').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Grams as "3,453 kg" (exact: weights are stored in whole grams), millimetres as "52,5 cm", in the locale's number format. */
export function formatMeasurement(locale: Locale, metric: GrowthMetric, value: number): string {
  return metric === 'weightG'
    ? `${formatNumber(locale, value / 1000, 3)} kg`
    : `${formatNumber(locale, value / 10, 1)} cm`;
}

function sideTotals(
  t: TranslateFn,
  segments: readonly { side: Side; start: number; end?: number }[],
): string {
  const totals = new Map<Side, number>();
  for (const segment of segments) {
    if (segment.end !== undefined)
      totals.set(segment.side, (totals.get(segment.side) ?? 0) + (segment.end - segment.start));
  }
  return (['L', 'R'] as const)
    .filter((side) => totals.has(side))
    .map((side) => {
      const ms = totals.get(side)!;
      // Under an hour, the minutes the edit sheet shows for the side (rounded, at least 1).
      return `${t(`side.${side}.button`)} ${ms < HOUR ? t('time.minutes', { m: segmentMinutes(ms) }) : formatDuration(t, ms)}`;
    })
    .join(' · ');
}

/** One line of detail per entry for the Günlük list. Tolerates rows with missing optional fields. */
export function describeEvent(
  t: TranslateFn,
  locale: Locale,
  event: TrackerEvent,
  now: number,
): string {
  const ml = (value: number) => t('unit.ml', { ml: formatNumber(locale, value) });
  switch (event.type) {
    case 'sleep':
      return formatDuration(t, (event.endAt ?? now) - event.startAt);
    case 'breastfeed': {
      const segments = event.segments ?? [];
      const current = segments.at(-1);
      if (event.endAt === undefined && current)
        return `${t(`side.${current.side}.button`)} · ${t('log.ongoing')}`;
      return sideTotals(t, segments);
    }
    case 'bottle':
      return `${ml(event.ml)} · ${t(`bottle.${event.contents}`)}`;
    case 'diaper': {
      const kind =
        event.wet && event.dirty
          ? t('describe.diaper.both')
          : event.dirty
            ? t('diaper.dirty.button')
            : t('diaper.wet.button');
      const parts = [kind];
      if (event.stoolColor) parts.push(t(`stool.color.${event.stoolColor}`));
      if (event.consistency) parts.push(t(`consistency.${event.consistency}`));
      return parts.join(' · ');
    }
    case 'pump': {
      const parts: string[] = [];
      if (event.mlLeft !== undefined) parts.push(`${t('side.L.button')} ${ml(event.mlLeft)}`);
      if (event.mlRight !== undefined) parts.push(`${t('side.R.button')} ${ml(event.mlRight)}`);
      return parts.join(' · ');
    }
    case 'growth': {
      const parts: string[] = [];
      if (event.weightG !== undefined)
        parts.push(formatMeasurement(locale, 'weightG', event.weightG));
      if (event.heightMm !== undefined)
        parts.push(t('describe.height', { value: formatNumber(locale, event.heightMm / 10, 1) }));
      if (event.headMm !== undefined)
        parts.push(t('describe.head', { value: formatNumber(locale, event.headMm / 10, 1) }));
      return parts.join(' · ');
    }
    case 'temperature':
      return t('describe.temperature', { value: formatNumber(locale, event.celsius, 1) });
    case 'medication':
      return event.dose ? `${event.name} · ${event.dose}` : event.name;
    case 'healthNote':
      return firstLine(event.note ?? '');
  }
}

/** A warning stool color, or a fever or low temperature: the row gets a marker. */
export function hasAlert(event: TrackerEvent): boolean {
  if (event.type === 'diaper') return event.dirty && stoolAlert(event.stoolColor) !== null;
  if (event.type === 'temperature') return temperatureAlert(event.celsius) !== null;
  return false;
}
