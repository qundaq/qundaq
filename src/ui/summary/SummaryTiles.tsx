import type { DailyTotals } from '../../domain/summary';
import { useT, type TranslateFn } from '../app/I18nProvider';
import { Icon } from '../shared/Icon';
import type { IconName } from '../shared/icons';
import {
  bottleTile,
  breastfeedTile,
  formatTileValue,
  tileDiffText,
  type TileKind,
  type TileText,
} from './dashboardModel';
import styles from './Summary.module.css';

type TileKey = 'sleep' | 'breastfeed' | 'bottle' | 'diapers';

/** A plain tile: one total, its diff on the same total. */
function plainTile(t: TranslateFn, kind: TileKind, value: number, previous: number): TileText {
  return { parts: [formatTileValue(t, kind, value)], diff: tileDiffText(t, kind, value, previous) };
}

const TILES: readonly {
  key: TileKey;
  icon: IconName;
  text: (t: TranslateFn, totals: DailyTotals, previous: DailyTotals) => TileText;
}[] = [
  {
    key: 'sleep',
    icon: 'moon',
    text: (t, totals, previous) => plainTile(t, 'duration', totals.sleepMs, previous.sleepMs),
  },
  { key: 'breastfeed', icon: 'heart', text: breastfeedTile },
  { key: 'bottle', icon: 'milk', text: bottleTile },
  {
    key: 'diapers',
    icon: 'baby',
    text: (t, totals, previous) => plainTile(t, 'count', totals.diapers, previous.diapers),
  },
];

/**
 * The dashboard's four hero numbers, each with a plain diff against the day right before it. The
 * breastfeeding tile shows the breastfeeds with the minutes at the breast ("5 (90 min)") and compares
 * the minutes; the bottle tile shows the bottles with their ml and compares the ml.
 */
export function SummaryTiles({ totals, previous }: { totals: DailyTotals; previous: DailyTotals }) {
  const t = useT();
  return (
    <div className={styles.tiles}>
      {TILES.map(({ key, icon, text }) => {
        const { parts, diff } = text(t, totals, previous);
        return (
          <div key={key} className={styles.tile} data-testid={`summary-tile-${key}`}>
            <div className={styles.tileLabel}>
              <Icon name={icon} size={16} />
              {t(`summary.tile.${key}`)}
            </div>
            <div className={styles.tileValue}>
              {/* Parts that wrap between them on a narrow tile, never inside one. */}
              {parts.map((part, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className={styles.tilePart}>{part}</span>
                </span>
              ))}
            </div>
            {diff && <div className={styles.tileDiff}>{diff}</div>}
          </div>
        );
      })}
    </div>
  );
}
