import type { ReactNode } from 'react';
import { babyAge } from '../../domain/age';
import type { BabyStatus } from '../../domain/status';
import type { DailyTotals } from '../../domain/summary';
import type { Baby } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { useLocale, useT } from '../app/I18nProvider';
import type { SheetKind } from '../log/drafts';
import { Card } from '../shared/Card';
import { CardActions } from './CardActions';
import { ageText, statTiles, todayLine } from './cardModel';
import { StatTiles } from './StatTiles';
import styles from './Home.module.css';

interface Props {
  baby: Baby;
  status: BabyStatus;
  today: DailyTotals;
  now: number;
  /** The live strips of the baby's running timers. */
  live?: ReactNode;
  onPick: (kind: SheetKind) => void;
}

export function BabyCard({ baby, status, today, now, live, onPick }: Props) {
  const t = useT();
  const locale = useLocale();
  const color = resolveBabyColor(baby.color);
  const age = ageText(t, babyAge(baby.birthDate, now));
  return (
    <Card as="article" accent={color} aria-label={baby.name} className={styles.babyCard}>
      <h2 className={styles.babyHeader}>
        <span className={styles.babyDot} style={{ background: color }} aria-hidden="true" />
        <span className={styles.babyName}>{baby.name}</span>
        {age && <span className={styles.babyAge}>{age}</span>}
      </h2>
      {live}
      <StatTiles tiles={statTiles(t, locale, status, now)} />
      <p className={styles.today}>{todayLine(t, today)}</p>
      <CardActions name={baby.name} onPick={onPick} />
    </Card>
  );
}
