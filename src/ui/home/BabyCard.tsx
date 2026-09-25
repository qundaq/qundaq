import type { ReactNode } from 'react';
import type { BabyStatus } from '../../domain/status';
import type { Baby } from '../../domain/types';
import { formatAgo, formatDuration } from '../format';
import { useT } from '../I18nProvider';

interface Props {
  baby: Baby;
  status: BabyStatus;
  now: number;
  children?: ReactNode; // timer controls (Task 7)
}

export function BabyCard({ baby, status, now, children }: Props) {
  const t = useT();

  let feed = t('status.none');
  if (status.runningFeed) {
    feed = t('status.feeding', {
      side: t(`side.${status.runningFeed.side}`),
      duration: formatDuration(t, now - status.runningFeed.startAt),
    });
  } else if (status.lastFeed) {
    const detail =
      status.lastFeed.kind === 'breastfeed' ? t(`side.${status.lastFeed.side}`) : t('status.bottleMl', { ml: status.lastFeed.ml });
    feed = `${formatAgo(t, now - status.lastFeed.at)} · ${detail}`;
  }

  let sleep = t('status.none');
  if (status.sleep.state === 'asleep') sleep = t('status.asleep', { duration: formatDuration(t, now - status.sleep.since) });
  else if (status.sleep.since !== null) sleep = t('status.awake', { duration: formatDuration(t, now - status.sleep.since) });

  let diaper = t('status.none');
  if (status.lastDiaper) {
    const { wet, dirty, at } = status.lastDiaper;
    const kind = wet && dirty ? t('diaper.both') : dirty ? t('diaper.dirty') : t('diaper.wet');
    diaper = `${formatAgo(t, now - at)} · ${kind}`;
  }

  return (
    <article className="card baby-card" aria-label={baby.name} style={{ borderLeftColor: baby.color }}>
      <h2>{baby.name}</h2>
      <dl className="status">
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
    </article>
  );
}
