import { useState, type FormEvent } from 'react';
import { BABY_NAME_MAX, addBaby, updateBaby } from '../../db/babies';
import { db } from '../../db/instance';
import type { Baby } from '../../domain/types';
import { messageFor } from '../ErrorBanner';
import { useT } from '../I18nProvider';
import { Sheet } from '../Sheet';
import { BABY_COLORS, nextColor } from './colors';

interface Props {
  open: boolean;
  baby?: Baby;
  usedColors: readonly string[];
  onClose: () => void;
}

export function BabyFormDialog({ open, baby, usedColors, onClose }: Props) {
  const t = useT();
  return (
    <Sheet open={open} title={t(baby ? 'babies.formTitle.edit' : 'babies.formTitle.add')} onClose={onClose}>
      <BabyForm baby={baby} usedColors={usedColors} onDone={onClose} />
    </Sheet>
  );
}

function BabyForm({ baby, usedColors, onDone }: { baby?: Baby; usedColors: readonly string[]; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState(baby?.name ?? '');
  const [color, setColor] = useState(baby?.color ?? nextColor(usedColors));
  const [birthDate, setBirthDate] = useState(baby?.birthDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const fields = { name, color, ...(birthDate ? { birthDate } : {}) };
      if (baby) await updateBaby(db, baby.id, fields);
      else await addBaby(db, fields);
      onDone();
    } catch (failure) {
      setError(messageFor(t, failure));
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <label className="field">
        {t('babies.name')}
        <input value={name} maxLength={BABY_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset>
        <legend>{t('babies.color')}</legend>
        <div className="swatches" role="radiogroup" aria-label={t('babies.color')}>
          {BABY_COLORS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={color === option.hex}
              aria-label={t(`color.${option.id}`)}
              className="swatch"
              style={{ background: option.hex }}
              onClick={() => setColor(option.hex)}
            />
          ))}
        </div>
      </fieldset>
      <label className="field">
        {t('babies.birthDate')}
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="status-warn">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}
