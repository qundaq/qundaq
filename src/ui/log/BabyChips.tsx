import { useId } from 'react';
import type { Baby, Id } from '../../domain/types';
import { resolveBabyColor } from '../babies/colors';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import { onRadioKeyDown } from '../shared/radio';
import styles from './LogSheet.module.css';

interface Props {
  babies: readonly Baby[];
  selected: readonly Id[];
  /** A measurement belongs to one child: exactly one chip is chosen. */
  single: boolean;
  onChange: (ids: Id[]) => void;
}

/**
 * Who the entry is for. Hidden with one baby. Opened from a card, that baby is chosen; a tap adds the twin.
 * At least one baby always stays chosen. The sheet.all chip leads only from three babies (with two, one tap
 * is enough).
 */
export function BabyChips({ babies, selected, single, onChange }: Props) {
  const t = useT();
  const labelId = useId();
  if (babies.length < 2) return null;
  const dot = (baby: Baby) => (
    <span
      className={styles.dot}
      style={{ background: resolveBabyColor(baby.color) }}
      aria-hidden="true"
    />
  );
  if (single)
    return (
      <div className={styles.group}>
        <span id={labelId} className={styles.groupLabel}>
          {t('sheet.babies')}
        </span>
        <div role="radiogroup" aria-labelledby={labelId} className={styles.chips}>
          {babies.map((baby, i) => {
            const chosen = selected[0] === baby.id;
            return (
              <Chip
                key={baby.id}
                mode="radio"
                selected={chosen}
                tabIndex={chosen ? 0 : -1}
                onClick={() => onChange([baby.id])}
                onKeyDown={(event) =>
                  onRadioKeyDown(event, i, babies.length, (j) => onChange([babies[j]!.id]))
                }
              >
                {dot(baby)}
                {baby.name}
              </Chip>
            );
          })}
        </div>
      </div>
    );
  const all = babies.every((baby) => selected.includes(baby.id));
  const toggle = (id: Id) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    if (next.length > 0) onChange(next);
  };
  return (
    <div className={styles.group} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.groupLabel}>
        {t('sheet.babies')}
      </span>
      <div className={styles.chips}>
        {babies.length > 2 && (
          <Chip selected={all} onClick={() => onChange(babies.map((baby) => baby.id))}>
            {t('sheet.all')}
          </Chip>
        )}
        {babies.map((baby) => (
          <Chip key={baby.id} selected={selected.includes(baby.id)} onClick={() => toggle(baby.id)}>
            {dot(baby)}
            {baby.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}
