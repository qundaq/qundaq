import type { Baby, TrackerEvent } from '../../domain/types';
import { useLocale, useT } from '../I18nProvider';
import { describeEvent, firstLine, hasAlert, timeRange, typeLabel } from './describe';

interface Props {
  event: TrackerEvent;
  baby: Baby | null; // null: a pump, the mother's entry
  day: number; // start of the day shown
  now: number;
  onOpen: () => void;
}

/** One Günlük entry: a single button (≥ 48px) that opens the edit sheet. */
export function EventRow({ event, baby, day, now, onOpen }: Props) {
  const t = useT();
  const locale = useLocale();
  const detail = describeEvent(t, locale, event, now);
  return (
    <button type="button" className="log-row" onClick={onOpen}>
      <span className="log-time">{timeRange(t, locale, event, day)}</span>
      <span className="log-main">
        <span className="dot" style={baby ? { background: baby.color } : undefined} aria-hidden="true" />
        <span>{baby ? baby.name : t('log.mother')}</span>
        <span className="muted">· {typeLabel(t, event.type)}</span>
        {hasAlert(event) && (
          <span className="log-warn" role="img" aria-label={t('log.warning')}>
            ⚠︎
          </span>
        )}
      </span>
      {detail && <span className="log-detail">{detail}</span>}
      {event.note && event.type !== 'healthNote' && (
        <span className="log-note">
          <span aria-hidden="true">✎︎ </span>
          {firstLine(event.note)}
        </span>
      )}
    </button>
  );
}
