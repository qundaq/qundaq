import { MINUTE, elapsedParts } from '../../domain/time';
import type { Locale } from '../../i18n';
import type { TranslateFn } from '../app/I18nProvider';

export function formatDuration(t: TranslateFn, ms: number): string {
  const { hours, minutes } = elapsedParts(ms);
  // A forgotten timer can run for days; "1 g 3 sa" reads better than "27 sa 15 dk".
  if (hours >= 24) return t('time.daysHours', { d: Math.floor(hours / 24), h: hours % 24 });
  return hours === 0
    ? t('time.minutes', { m: minutes })
    : t('time.hoursMinutes', { h: hours, m: minutes });
}

export function formatAgo(t: TranslateFn, ms: number): string {
  return ms < MINUTE ? t('time.justNow') : t('time.ago', { duration: formatDuration(t, ms) });
}

/**
 * The brand row's per-screen context: the weekday and the short date. Composed from two formats rather
 * than one call with both — Node's ICU orders `tr`'s combined `{ weekday, day, month }` as "26 Eyl
 * Cumartesi", not "Cumartesi, 26 Eyl" as browsers give it.
 */
export function brandDate(locale: Locale, now: number): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(now);
  return `${weekday}, ${dayMonth}`;
}
