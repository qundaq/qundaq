import { MINUTE, elapsedParts } from '../domain/time';
import type { TranslateFn } from './I18nProvider';

export function formatDuration(t: TranslateFn, ms: number): string {
  const { hours, minutes } = elapsedParts(ms);
  return hours === 0 ? t('time.minutes', { m: minutes }) : t('time.hoursMinutes', { h: hours, m: minutes });
}

export function formatAgo(t: TranslateFn, ms: number): string {
  return ms < MINUTE ? t('time.justNow') : t('time.ago', { duration: formatDuration(t, ms) });
}
