import type { ReactNode } from 'react';
import type { BabyStatus } from '../../domain/status';
import type { Baby } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { Card } from '../shared/Card';
import { formatAgo, formatDuration } from '../shared/format';
import { useT } from '../app/I18nProvider';
import styles from './Home.module.css';

interface Props {
  baby: Baby;
  status: BabyStatus;
  now: number;
  children?: ReactNode; // timer controls
}

export function BabyCard({ baby, status, now, children }: Props) {
  const t = useT();

  let feed: ReactNode = t('status.none');
  if (status.runningFeed) {
    feed = (
      <span className={styles.live} data-testid="live-text">
        {t('status.feeding', {
          side: t(`side.${status.runningFeed.side}`),
          duration: formatDuration(t, now - status.runningFeed.startAt),
        })}
      </span>
    );
  } else if (status.lastFeed) {
    const detail =
      status.lastFeed.kind === 'breastfeed'
        ? t(`side.${status.lastFeed.side}`)
        : t('status.bottleMl', { ml: status.lastFeed.ml });
    feed = `${formatAgo(t, now - status.lastFeed.at)} · ${detail}`;
  }

  let sleep: ReactNode = t('status.none');
  if (status.sleep.state === 'asleep')
    sleep = (
      <span className={styles.live} data-testid="live-text">
        {t('status.asleep', { duration: formatDuration(t, now - status.sleep.since) })}
      </span>
    );
  else if (status.sleep.since !== null)
    sleep = t('status.awake', { duration: formatDuration(t, now - status.sleep.since) });

  let diaper = t('status.none');
  if (status.lastDiaper) {
    const { wet, dirty, at } = status.lastDiaper;
    const kind = wet && dirty ? t('diaper.both') : dirty ? t('diaper.dirty') : t('diaper.wet');
    diaper = `${formatAgo(t, now - at)} · ${kind}`;
  }

  return (
    <Card
      as="article"
      accent={resolveBabyColor(baby.color)}
      aria-label={baby.name}
      className={styles.babyCard}
    >
      <h2 className={styles.babyName}>{baby.name}</h2>
      <dl className={styles.status}>
        <div>
          <dt>{t('status.feed')}</dt>
          <dd>{feed}</dd>
        </div>
        <div>
          <dt>{t('status.sleep')}</dt>
          <dd>{sleep}</dd>
        </div>
        <div>
          <dt>{t('status.diaper')}</dt>
          <dd>{diaper}</dd>
        </div>
      </dl>
      {children}
    </Card>
  );
}
