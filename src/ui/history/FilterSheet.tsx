import { TYPE_FILTERS, type TypeFilter } from '../../domain/filters';
import type { Baby, Id } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import { Sheet } from '../shared/Sheet';
import styles from './Log.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  babies: readonly Baby[];
  babyId: Id | null;
  type: TypeFilter;
  onBabyChange: (id: Id | null) => void;
  onTypeChange: (type: TypeFilter) => void;
}

/** The log (history) tab's baby and type filters, chosen live (no Save/Cancel — closing keeps whatever is chosen). */
export function FilterSheet({
  open,
  onClose,
  babies,
  babyId,
  type,
  onBabyChange,
  onTypeChange,
}: Props) {
  const t = useT();
  return (
    <Sheet open={open} title={t('log.filter.trigger')} onClose={onClose}>
      {babies.length > 1 && (
        <fieldset className={styles.filter}>
          <legend>{t('log.filter.baby')}</legend>
          <div className={styles.chips}>
            <Chip selected={babyId === null} onClick={() => onBabyChange(null)}>
              {t('sheet.all')}
            </Chip>
            {babies.map((baby) => (
              <Chip
                key={baby.id}
                selected={babyId === baby.id}
                onClick={() => onBabyChange(baby.id)}
              >
                {baby.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className={styles.filter}>
        <legend>{t('log.filter.type')}</legend>
        <div className={styles.chips}>
          {TYPE_FILTERS.map((filter) => (
            <Chip key={filter} selected={type === filter} onClick={() => onTypeChange(filter)}>
              {filter === 'all' ? t('sheet.all') : t(`log.type.${filter}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </Sheet>
  );
}
