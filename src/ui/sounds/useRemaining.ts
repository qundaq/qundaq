import type { TranslateFn } from '../I18nProvider';
import { useNow } from '../useNow';
import { remainingText } from './text';

/** "24 dk kaldı" for the running timer, refreshed every 10 s; a stale render clock never inflates the minutes. */
export function useRemaining(t: TranslateFn, endsAt: number | null): string | null {
  const now = useNow(10_000);
  return remainingText(t, endsAt, Math.max(now, Date.now()));
}
