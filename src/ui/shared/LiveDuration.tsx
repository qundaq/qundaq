import { useT } from '../app/I18nProvider';
import { formatClock, formatDuration } from './format';
import { useNow } from './useNow';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * A running timer's elapsed time with seconds. It owns a one-second clock, so only this text re-renders;
 * the ticking digits are hidden from assistive tech, which reads the minute-precision text instead.
 */
export function LiveDuration({ since, className }: { since: number; className?: string }) {
  const t = useT();
  const now = useNow(1000);
  const ms = Math.max(0, now - since);
  return (
    <span className={className} data-testid="live-text">
      <span aria-hidden="true">{formatClock(t, ms)}</span>
      <VisuallyHidden>{formatDuration(t, ms)}</VisuallyHidden>
    </span>
  );
}
