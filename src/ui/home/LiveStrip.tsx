import type { ReactNode } from 'react';
import type { Side } from '../../domain/types';
import { useLocale, useT } from '../app/I18nProvider';
import { clockTime } from '../history/describe';
import { Button } from '../shared/Button';
import { Icon } from '../shared/Icon';
import { LiveDuration } from '../shared/LiveDuration';
import styles from './Home.module.css';

type Props = {
  name: string;
  since: number;
  onStop: () => void;
  /** Under the strip: the "forgot to stop?" hint (timer.forgot) when the timer has run suspiciously long. */
  hint?: ReactNode;
} & ({ kind: 'sleep' } | { kind: 'breastfeed'; side: Side; onSwitch: () => void });

/** One running timer inside its baby's card: what runs, for how long (with seconds), and how to stop it. */
export function LiveStrip(props: Props) {
  const t = useT();
  const locale = useLocale();
  const { name, since, onStop, hint } = props;
  const caption =
    props.kind === 'sleep'
      ? t('strip.asleep', { time: clockTime(locale, since) })
      : t('strip.feeding', { side: t(`side.${props.side}.button`) });
  return (
    <>
      <div className={styles.strip}>
        <Icon name={props.kind === 'sleep' ? 'moon' : 'heart'} className={styles.stripIcon} />
        <p className={styles.stripText}>
          <span className={styles.stripCaption}>{caption}</span>
          <LiveDuration since={since} className={styles.stripClock} />
        </p>
        <div className={styles.stripControls} data-testid="timer-row">
          {props.kind === 'breastfeed' ? (
            <>
              <Button
                icon="arrow-left-right"
                aria-label={`${name}: ${t('timer.switchSide')}`}
                onClick={props.onSwitch}
              >
                {t('timer.side')}
              </Button>
              <Button
                variant="primary"
                aria-label={`${name}: ${t('timer.stopFeed')}`}
                onClick={onStop}
              >
                {t('timer.stop')}
              </Button>
            </>
          ) : (
            <Button variant="primary" aria-label={`${name}: ${t('timer.wakeUp')}`} onClick={onStop}>
              {t('timer.wakeUp')}
            </Button>
          )}
        </div>
      </div>
      {hint}
    </>
  );
}
