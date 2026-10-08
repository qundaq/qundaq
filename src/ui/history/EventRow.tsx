import type { Baby, TrackerEvent } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { useLocale, useT } from '../app/I18nProvider';
import { Icon } from '../shared/Icon';
import { describeEvent, firstLine, hasAlert, timeRange, typeIcon, typeLabel } from './describe';
import styles from './Log.module.css';

interface Props {
  event: TrackerEvent;
  baby: Baby | null; // null: a pump, the mother's entry
  day: number; // start of the day shown
  now: number;
  /**
   * A row inside an activity group, whose heading already names the type: no type icon or name, and the
   * time shares one line with the baby (or the mother, for a pump).
   */
  compact?: boolean;
  onOpen: () => void;
}

/** One log (history) entry: a single button (≥ 48px) that opens the edit sheet. */
export function EventRow({ event, baby, day, now, compact = false, onOpen }: Props) {
  const t = useT();
  const locale = useLocale();
  const detail = describeEvent(t, locale, event, now);
  const time = <span className={styles.time}>{timeRange(t, locale, event, day)}</span>;
  const who = (
    <span className={styles.main}>
      {!compact && (
        <span className={styles.typeIcon}>
          <Icon name={typeIcon(event.type)} size={16} />
        </span>
      )}
      <span
        className={styles.dot}
        style={baby ? { background: resolveBabyColor(baby.color) } : undefined}
        aria-hidden="true"
      />
      <span>{baby ? baby.name : t('log.mother')}</span>
      {!compact && <span className={styles.muted}>· {typeLabel(t, event.type)}</span>}
      {hasAlert(event) && (
        <Icon name="triangle-alert" size={16} label={t('log.warning')} className={styles.warn} />
      )}
    </span>
  );
  return (
    <button type="button" className={styles.row} onClick={onOpen}>
      {compact ? (
        <span className={styles.compactHead}>
          {time}
          {who}
        </span>
      ) : (
        <>
          {time}
          {who}
        </>
      )}
      {detail && <span className={styles.detail}>{detail}</span>}
      {event.note && event.type !== 'healthNote' && (
        <span className={styles.note}>
          <Icon name="pencil" size={16} /> {firstLine(event.note)}
        </span>
      )}
    </button>
  );
}
