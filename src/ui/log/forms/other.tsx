import { useState } from 'react';
import type { RecentMedication } from '../../../db/events';
import { parseDecimal, scaleToInt } from '../../../domain/decimal';
import { temperatureAlert } from '../../../domain/health';
import { TEXT_LIMITS } from '../../../domain/rules';
import { useT } from '../../app/I18nProvider';
import type { GrowthInput, MedicationInput, PumpInput, TemperatureInput } from '../drafts';
import { DecimalField, type FormProps } from './fields';

/** Text fields with the numeric keypad: the typed text is kept, and "60.5" is reported on save, not truncated. */
export function PumpForm({ value, onChange }: FormProps<PumpInput>) {
  const t = useT();
  return (
    <div className="field-row">
      <label className="field">
        {t('pump.left')}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value.mlLeft}
          onChange={(e) => onChange({ ...value, mlLeft: e.target.value })}
        />
      </label>
      <label className="field">
        {t('pump.right')}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value.mlRight}
          onChange={(e) => onChange({ ...value, mlRight: e.target.value })}
        />
      </label>
    </div>
  );
}

export function GrowthForm({ value, onChange }: FormProps<GrowthInput>) {
  const t = useT();
  return (
    <>
      <DecimalField
        label={t('growth.weight')}
        value={value.weightKg}
        onChange={(weightKg) => onChange({ ...value, weightKg })}
      />
      <DecimalField
        label={t('growth.height')}
        value={value.heightCm}
        onChange={(heightCm) => onChange({ ...value, heightCm })}
      />
      <DecimalField
        label={t('growth.head')}
        value={value.headCm}
        onChange={(headCm) => onChange({ ...value, headCm })}
      />
    </>
  );
}

export function TemperatureForm({ value, onChange }: FormProps<TemperatureInput>) {
  const t = useT();
  const parsed = parseDecimal(value.celsius);
  // Rounded exactly as it will be stored, so 37,95 already shows the fever hint.
  const alert = parsed === null ? null : temperatureAlert(scaleToInt(parsed, 10) / 10);
  // The hint follows only values that parse (or an emptied field): "38," on the way to "38,2" neither hides
  // it nor makes a screen reader announce it twice. One polite live region stays in the DOM.
  const [shown, setShown] = useState(alert);
  if ((parsed !== null || value.celsius.trim() === '') && alert !== shown) setShown(alert);
  return (
    <>
      <DecimalField
        label={t('temperature.value')}
        value={value.celsius}
        onChange={(celsius) => onChange({ celsius })}
      />
      <p className="stool-alert" aria-live="polite" hidden={shown === null}>
        {shown === null ? '' : t(`temperature.alert.${shown}`)}
      </p>
    </>
  );
}

export function MedicationForm({
  value,
  onChange,
  recent,
}: FormProps<MedicationInput> & { recent: readonly RecentMedication[] }) {
  const t = useT();
  return (
    <>
      <label className="field">
        {t('medication.name')}
        <input
          type="text"
          autoComplete="off"
          maxLength={TEXT_LIMITS.medicationName}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      {recent.length > 0 && (
        <div className="chips recent" role="group" aria-label={t('medication.recent')}>
          {recent.map((medication) => (
            <button
              key={medication.name}
              type="button"
              className="chip"
              onClick={() => onChange({ name: medication.name, dose: medication.dose ?? '' })}
            >
              {medication.name}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        {t('medication.dose')}
        <input
          type="text"
          autoComplete="off"
          maxLength={TEXT_LIMITS.dose}
          value={value.dose}
          onChange={(e) => onChange({ ...value, dose: e.target.value })}
        />
      </label>
    </>
  );
}
