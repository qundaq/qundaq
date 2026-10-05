import type { ReactNode } from 'react';
import type { PumpEvent } from '../../domain/pump';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Icon } from '../shared/Icon';
import { LiveDuration } from '../shared/LiveDuration';
import styles from './Home.module.css';

/**
 * The parent's running pump, above the baby cards in place of the pumping button: what runs and for how
 * long (with seconds), "Stop" at once, or a tap on the text for the sheet that corrects the minutes and
 * adds ml before finishing.
 */
export function PumpStrip({
  pump,
  onOpen,
  onStop,
  hint,
}: {
  pump: PumpEvent;
  onOpen: () => void;
  onStop: () => void;
  /** Under the strip: the "forgot to stop?" hint (timer.forgot) when the pump has run suspiciously long. */
  hint?: ReactNode;
}) {
  const t = useT();
  const caption =
    pump.side === undefined
      ? t('home.pump')
      : t('strip.pumping', { side: t(`side.${pump.side}.button`) });
  return (
    <section aria-label={t('strip.pump.region')} className={styles.pumpRunning}>
      <div className={styles.strip}>
        <button
          type="button"
          className={styles.stripOpen}
          aria-haspopup="dialog"
          // A stable name, without the ticking clock: what runs and what the tap does.
          aria-label={t('strip.pump.open', { what: caption })}
          onClick={onOpen}
        >
          <Icon name="droplets" className={styles.stripIcon} />
          <span className={styles.stripText}>
            <span className={styles.stripCaption}>{caption}</span>
            <LiveDuration since={pump.startAt} className={styles.stripClock} />
          </span>
          <Icon name="chevron-right" className={styles.stripIcon} />
        </button>
        <div className={styles.stripControls}>
          <Button variant="primary" aria-label={t('timer.stopPump')} onClick={onStop}>
            {t('timer.stop')}
          </Button>
        </div>
      </div>
      {hint}
    </section>
  );
}
