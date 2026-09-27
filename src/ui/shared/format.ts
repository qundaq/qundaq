import { MINUTE, elapsedParts } from '../../domain/time';
import type { Locale } from '../../i18n';
import type { TranslateFn } from '../app/I18nProvider';

const two = (n: number) => String(n).padStart(2, '0');

export function formatDuration(t: TranslateFn, ms: number): string {
  const { hours, minutes } = elapsedParts(ms);
  // A forgotten timer can run for days; the days+hours form (time.daysHours) reads better than
  // the hours+minutes form (time.hoursMinutes) once it runs past a day.
  if (hours >= 24) return t('time.daysHours', { d: Math.floor(hours / 24), h: hours % 24 });
  return hours === 0
    ? t('time.minutes', { m: minutes })
    : t('time.hoursMinutes', { h: hours, m: minutes });
}

/** A running timer's face: "4:07", "1:02:09"; past a day the minute-precision days+hours form (time.daysHours). */
export function formatClock(t: TranslateFn, ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds >= 24 * 3600) return formatDuration(t, ms);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function formatAgo(t: TranslateFn, ms: number): string {
  return ms < MINUTE ? t('time.justNow') : t('time.ago', { duration: formatDuration(t, ms) });
}

/**
 * The brand row's per-screen context: the weekday and the short date. Composed from two formats rather
 * than one call with both — Node's ICU orders `tr`'s combined `{ weekday, day, month }` in day-month-weekday
 * order, not weekday-first as browsers give it.
 */
export function brandDate(locale: Locale, now: number): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(now);
  return `${weekday}, ${dayMonth}`;
}
