import { addDays, dayOffset, fromDateInputValue } from '../../domain/days';
import type { TypeFilter } from '../../domain/filters';
import { temperatureAlert } from '../../domain/health';
import { isSingleDay, resolveRange, type RangeChoice } from '../../domain/ranges';
import { isTimedType } from '../../domain/rules';
import { stoolAlert } from '../../domain/stool';
import type { GrowthMetric } from '../../domain/summary';
import type { Baby, EventType, Id, Side, TrackerEvent } from '../../domain/types';
import type { Locale } from '../../i18n';
import { HOUR } from '../../domain/time';
import { formatDuration } from '../shared/format';
import { dateTimeFormat, numberFormat } from '../shared/intl';
import type { TranslateFn } from '../app/I18nProvider';
import type { IconName } from '../shared/icons';
import { segmentMinutes } from '../log/edits';

// Formatters come from the shared cache (../shared/intl), which starts over when the time zone changes.

export function formatNumber(locale: Locale, value: number, maximumFractionDigits = 0): string {
  return numberFormat(locale, { maximumFractionDigits }).format(value);
}

export function clockTime(locale: Locale, ms: number): string {
  return dateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    ms,
  );
}

export function shortDate(locale: Locale, ms: number): string {
  return dateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(ms);
}

export function longDate(locale: Locale, ms: number): string {
  return dateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
}

export function weekdayShort(locale: Locale, ms: number): string {
  return dateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(ms);
}

function sameYear(a: number, b: number): boolean {
  return new Date(a).getFullYear() === new Date(b).getFullYear();
}

/** A date-input value, or null for an empty/unparseable value or for `today` itself (meaning "clear the override"). */
export function pickedDay(value: string, today: number): number | null {
  const picked = fromDateInputValue(value);
  if (picked === null || picked >= today) return null;
  return picked;
}

/**
 * What a day picker's onChange should receive for a native date-input's raw `value`, or undefined when the
 * change should be ignored entirely (an empty string from the Clear button, or otherwise unparseable).
 */
export function resolveDayInputChange(value: string, today: number): number | null | undefined {
  if (fromDateInputValue(value) === null) return undefined;
  return pickedDay(value, today);
}

/** day.today, day.yesterday, otherwise the day formatted with `format`, with its year when that is not this year. */
function relativeDay(
  t: TranslateFn,
  locale: Locale,
  dayStart: number,
  now: number,
  format: Intl.DateTimeFormatOptions,
): string {
  const daysAgo = dayOffset(dayStart, now);
  if (daysAgo === 0) return t('day.today');
  if (daysAgo === 1) return t('day.yesterday');
  const options: Intl.DateTimeFormatOptions = sameYear(dayStart, now)
    ? format
    : { ...format, year: 'numeric' };
  return dateTimeFormat(locale, options).format(dayStart);
}

/** day.today ("Today"), day.yesterday ("Yesterday"), otherwise the weekday with the date. */
export function dayLabel(t: TranslateFn, locale: Locale, dayStart: number, now: number): string {
  return relativeDay(t, locale, dayStart, now, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Like dayLabel, but a short date (day and abbreviated month; the year only when not this year) for any
 * other day — for the brand row's tight width. */
export function dayLabelShort(
  t: TranslateFn,
  locale: Locale,
  dayStart: number,
  now: number,
): string {
  return relativeDay(t, locale, dayStart, now, { day: 'numeric', month: 'short' });
}

/** A multi-day log list's day heading: like dayLabel, but "Mon, Oct 5" for any other day. */
export function dayHeading(t: TranslateFn, locale: Locale, dayStart: number, now: number): string {
  return relativeDay(t, locale, dayStart, now, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * The log's range label: a quick range's name, a single custom day's short label, or "5 Oct – 12 Oct" — with
 * the years ("28 Dec 2025 – 3 Jan 2026") when the range is not all in this year.
 */
export function rangeLabel(
  t: TranslateFn,
  locale: Locale,
  choice: RangeChoice,
  now: number,
): string {
  if (choice.kind === 'preset') return t(`range.${choice.preset}`);
  const range = resolveRange(choice, now);
  if (isSingleDay(range)) return dayLabelShort(t, locale, range.from, now);
  const last = addDays(range.to, -1);
  const format = dateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear(range.from, last) && sameYear(last, now) ? {} : { year: 'numeric' }),
  });
  return `${format.format(range.from)} – ${format.format(last)}`;
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

/** "14:05"; for a timer "22:10 – 06:30" or a running one with log.ongoing at the end, each end marked if on another day. */
export function timeRange(
  t: TranslateFn,
  locale: Locale,
  event: TrackerEvent,
  shownDay: number,
): string {
  const start = timeOnDay(t, locale, event.startAt, shownDay);
  if (!isTimedType(event.type)) return start;
  // A pump logged with ml only is a moment and reads like one.
  if (event.type === 'pump' && event.endAt === event.startAt) return start;
  if (event.endAt === undefined) return t('log.range.running', { start });
  return `${start} – ${timeOnDay(t, locale, event.endAt, shownDay)}`;
}

/** sheet.all ("All"), a baby's name, a type's name, or both joined — whatever the log's filter row shows as its summary. */
export function filterSummary(
  t: TranslateFn,
  babies: readonly Baby[],
  babyId: Id | null,
  type: TypeFilter,
): string {
  const babyPart = babyId === null ? null : (babies.find((b) => b.id === babyId)?.name ?? null);
  const typePart = type === 'all' ? null : t(`log.type.${type}`);
  const parts = [babyPart, typePart].filter((part): part is string => part !== null);
  return parts.length === 0 ? t('sheet.all') : parts.join(' · ');
}

export function typeLabel(t: TranslateFn, type: EventType): string {
  return t(`sheet.${type}.title`);
}

const TYPE_ICONS: Record<EventType, IconName> = {
  sleep: 'moon',
  breastfeed: 'heart',
  bottle: 'milk',
  diaper: 'baby',
  pump: 'droplets',
  growth: 'ruler',
  temperature: 'thermometer',
  medication: 'pill',
  healthNote: 'notebook-pen',
};

export function typeIcon(type: EventType): IconName {
  return TYPE_ICONS[type];
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

export function sideTotals(
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

/** One line of detail per entry for the log (history) list. Tolerates rows with missing optional fields. */
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
