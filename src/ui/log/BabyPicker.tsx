import type { Baby, Id } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import styles from './LogSheet.module.css';

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
