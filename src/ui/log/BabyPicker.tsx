import type { Baby, Id } from '../../domain/types';
import { useT } from '../app/I18nProvider';

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
      <div className="chips">
        {babies.length > 1 && (
          <button
            type="button"
            className="chip"
            aria-pressed={allSelected}
            onClick={() => onChange(babies.map((b) => b.id))}
          >
            {t('sheet.all')}
          </button>
        )}
        {babies.map((baby) => (
          <button
            key={baby.id}
            type="button"
            className="chip"
            aria-pressed={selected.includes(baby.id)}
            onClick={() => toggle(baby.id)}
          >
            {baby.name}
          </button>
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
      <div className="chips">
        {babies.map((baby) => (
          <button
            key={baby.id}
            type="button"
            className="chip"
            aria-pressed={selected === baby.id}
            onClick={() => onChange(baby.id)}
          >
            {baby.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
