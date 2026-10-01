import { useId } from 'react';
import type { Baby, Id } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { useT } from '../app/I18nProvider';
import { cx } from '../shared/cx';
import { onRadioKeyDown } from '../shared/radio';
import styles from './Summary.module.css';

/**
 * Picks which baby's tiles and week chart are shown; the day strip always shows every baby, in the
 * babies' own order, whichever is picked. Absent for a single baby.
 */
export function BabySwitcher({
  babies,
  selected,
  onChange,
}: {
  babies: readonly Baby[];
  selected: Id;
  onChange: (id: Id) => void;
}) {
  const t = useT();
  const labelId = useId();
  if (babies.length < 2) return null;
  return (
    <div className={styles.babySwitcher}>
      <span id={labelId} className={styles.hiddenLabel}>
        {t('summary.babySwitcher')}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.babySwitcherGroup}>
        {babies.map((baby, i) => {
          const checked = baby.id === selected;
          return (
            <button
              key={baby.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={cx(styles.babySwitcherSegment, checked && styles.babySwitcherChecked)}
              onClick={() => onChange(baby.id)}
              onKeyDown={(event) =>
                onRadioKeyDown(event, i, babies.length, (j) => onChange(babies[j]!.id))
              }
            >
              <span
                className={styles.babyDot}
                style={{ background: resolveBabyColor(baby.color) }}
                aria-hidden="true"
              />
              {baby.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
