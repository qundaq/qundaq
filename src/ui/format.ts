import { MINUTE, elapsedParts } from '../domain/time';
import type { TranslateFn } from './I18nProvider';

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
