import type { DailyTotals } from '../../domain/summary';
import { useT } from '../app/I18nProvider';
import { Icon } from '../shared/Icon';
import type { IconName } from '../shared/icons';
import { formatTileValue, tileDiffText, type TileKind } from './dashboardModel';
import styles from './Summary.module.css';

const TILES: readonly {
  key: 'sleep' | 'feeds' | 'bottle' | 'diapers';
  icon: IconName;
  kind: TileKind;
}[] = [
  { key: 'sleep', icon: 'moon', kind: 'duration' },
  { key: 'feeds', icon: 'heart', kind: 'count' },
  { key: 'bottle', icon: 'milk', kind: 'ml' },
  { key: 'diapers', icon: 'baby', kind: 'count' },
];

function valueOf(key: (typeof TILES)[number]['key'], totals: DailyTotals): number {
  switch (key) {
    case 'sleep':
      return totals.sleepMs;
    case 'feeds':
      return totals.feeds;
    case 'bottle':
      return totals.bottleMl;
    case 'diapers':
      return totals.diapers;
  }
}

/** The dashboard's four hero numbers, each with a plain diff against the day right before it. */
export function SummaryTiles({ totals, previous }: { totals: DailyTotals; previous: DailyTotals }) {
  const t = useT();
  return (
    <div className={styles.tiles}>
      {TILES.map(({ key, icon, kind }) => {
        const current = valueOf(key, totals);
        const before = valueOf(key, previous);
        const diff = tileDiffText(t, kind, current, before);
        return (
          <div key={key} className={styles.tile} data-testid={`summary-tile-${key}`}>
            <div className={styles.tileLabel}>
              <Icon name={icon} size={16} />
              {t(`summary.tile.${key}`)}
            </div>
            <div className={styles.tileValue}>{formatTileValue(t, kind, current)}</div>
            {diff && <div className={styles.tileDiff}>{diff}</div>}
          </div>
        );
      })}
    </div>
  );
}
