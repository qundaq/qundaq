import type { Baby, Id } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import styles from './LogSheet.module.css';

interface Props {
  babies: readonly Baby[];
  selected: readonly Id[];
  onChange: (next: Id[]) => void;
}

/** One chip per baby plus "All". At least one baby always stays selected. */
export function BabyPicker({ babies, selected, onChange }: Props) {
  const t = useT();
  const allSelected = babies.length > 0 && babies.every((b) => selected.includes(b.id));
  const toggle = (id: Id) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    if (next.length > 0) onChange(next);
  };
  return (
    <fieldset>
      <legend>{t('sheet.babies')}</legend>
      <div className={styles.chips}>
        {babies.length > 1 && (
          <Chip selected={allSelected} onClick={() => onChange(babies.map((b) => b.id))}>
            {t('sheet.all')}
          </Chip>
        )}
        {babies.map((baby) => (
          <Chip key={baby.id} selected={selected.includes(baby.id)} onClick={() => toggle(baby.id)}>
            {baby.name}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** Exactly one baby, no "All": for a measurement, and for the edit sheet (one entry, one baby). */
export function SingleBabyPicker({
  babies,
  selected,
  onChange,
}: {
  babies: readonly Baby[];
  selected: Id | null;
  onChange: (id: Id) => void;
}) {
  const t = useT();
  return (
    <fieldset>
      <legend>{t('sheet.babies')}</legend>
      <div className={styles.chips}>
        {babies.map((baby) => (
          <Chip key={baby.id} selected={selected === baby.id} onClick={() => onChange(baby.id)}>
            {baby.name}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
