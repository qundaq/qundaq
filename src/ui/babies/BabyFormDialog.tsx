import { useId, useRef, useState, type FormEvent } from 'react';
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
    <Sheet
      open={open}
      title={t(baby ? 'babies.formTitle.edit' : 'babies.formTitle.add')}
      onClose={onClose}
    >
      <BabyForm baby={baby} usedColors={usedColors} onDone={onClose} />
    </Sheet>
  );
}

function BabyForm({
  baby,
  usedColors,
  onDone,
}: {
  baby?: Baby;
  usedColors: readonly string[];
  onDone: () => void;
}) {
  const t = useT();
  const colorGroup = useId();
  const [name, setName] = useState(baby?.name ?? '');
  const [color, setColor] = useState(baby?.color ?? nextColor(usedColors));
  const [birthDate, setBirthDate] = useState(baby?.birthDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    try {
      // On edit an emptied date field clears the stored date (Dexie drops keys set to undefined).
      if (baby) await updateBaby(db, baby.id, { name, color, birthDate: birthDate || undefined });
      else await addBaby(db, { name, color, ...(birthDate ? { birthDate } : {}) });
      onDone(); // the guard stays set: the form only waits for its dialog to close
    } catch (failure) {
      setError(messageFor(t, failure));
      submitting.current = false;
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <label className="field">
        {t('babies.name')}
        <input
          value={name}
          maxLength={BABY_NAME_MAX}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>{t('babies.color')}</legend>
        <div className="swatches">
          {BABY_COLORS.map((option) => (
            <label key={option.id} className="swatch" style={{ background: option.hex }}>
              <input
                type="radio"
                name={colorGroup}
                value={option.hex}
                aria-label={t(`color.${option.id}`)}
                checked={color === option.hex}
                onChange={() => setColor(option.hex)}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        {t('babies.birthDate')}
        <input
          type="date"
          value={birthDate}
          min="1900-01-01"
          max="9999-12-31"
          onChange={(e) => setBirthDate(e.target.value)}
        />
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
