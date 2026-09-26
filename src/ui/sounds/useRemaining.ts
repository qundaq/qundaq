import type { TranslateFn } from '../app/I18nProvider';
import { useNow } from '../shared/useNow';
import { remainingText } from './text';

/** "24 dk kaldı" for the running timer, refreshed every 10 s; a stale render clock never inflates the minutes. */
export function useRemaining(t: TranslateFn, endsAt: number | null): string | null {
  const now = useNow(10_000);
  // The 10 s tick can lag; clamping to the real clock keeps a stale render from inflating the minutes.
  // eslint-disable-next-line react-hooks/purity
  return remainingText(t, endsAt, Math.max(now, Date.now()));
}
