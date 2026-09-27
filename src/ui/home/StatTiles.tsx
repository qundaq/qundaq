import type { Tile } from './cardModel';
import styles from './Home.module.css';

/** Three equal, left-aligned tiles; a definition list so each value is read with its label. */
export function StatTiles({ tiles }: { tiles: readonly Tile[] }) {
  return (
    <dl className={styles.tiles}>
      {tiles.map((tile) => (
        <div key={tile.label} className={styles.tile}>
          <dt className={styles.tileLabel}>{tile.label}</dt>
          <dd className={styles.tileValue}>{tile.value}</dd>
          <dd className={styles.tileCaption}>{tile.caption}</dd>
        </div>
      ))}
    </dl>
  );
}
