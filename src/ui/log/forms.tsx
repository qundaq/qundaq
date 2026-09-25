import { useId, useState } from 'react';
import type { RecentMedication } from '../../db/events';
import { parseDecimal, scaleToInt } from '../../domain/decimal';
import { temperatureAlert } from '../../domain/health';
import { TEXT_LIMITS } from '../../domain/rules';
import { STOOL_COLORS, stoolAlert } from '../../domain/stool';
import type { BottleContents, Consistency, Side } from '../../domain/types';
import { useT } from '../I18nProvider';
import {
  OTHER_TYPES,
  type BottleInput,
  type BreastfeedInput,
  type DiaperInput,
  type GrowthInput,
  type MedicationInput,
  type OtherType,
  type PumpInput,
  type SleepInput,
  type TemperatureInput,
} from './drafts';

const CONSISTENCIES: readonly Consistency[] = ['watery', 'soft', 'formed', 'hard'];

export interface FormProps<T> {
  value: T;
  onChange: (next: T) => void;
}

export function DiaperForm({ value, onChange }: FormProps<DiaperInput>) {
  const t = useT();
  const stoolGroup = useId();
  const alert = value.dirty ? stoolAlert(value.stoolColor ?? undefined) : null;
  return (
    <>
      <fieldset>
        <legend>{t('diaper.kind')}</legend>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={value.wet} onClick={() => onChange({ ...value, wet: !value.wet })}>
            {t('diaper.wet.button')}
          </button>
          <button type="button" className="chip" aria-pressed={value.dirty} onClick={() => onChange({ ...value, dirty: !value.dirty })}>
            {t('diaper.dirty.button')}
          </button>
        </div>
      </fieldset>
      {value.dirty && (
        <>
          <fieldset>
            <legend>{t('stool.color')}</legend>
            <div className="swatches">
              {STOOL_COLORS.map((color) => (
                <label key={color.id} className="swatch" style={{ background: color.hex }}>
                  <input
                    type="radio"
                    name={stoolGroup}
                    value={color.id}
                    aria-label={t(`stool.color.${color.id}`)}
                    checked={value.stoolColor === color.id}
                    onChange={() => onChange({ ...value, stoolColor: color.id })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {alert && (
            <p role="alert" className="stool-alert">
              {t(`stool.alert.${alert}`)}
            </p>
          )}
          <fieldset>
            <legend>{t('stool.consistency')}</legend>
            <div className="chips">
              {CONSISTENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={value.consistency === c}
                  onClick={() => onChange({ ...value, consistency: c })}
                >
                  {t(`consistency.${c}`)}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </>
  );
}

const SIDES: readonly Side[] = ['L', 'R'];
const CONTENTS: readonly BottleContents[] = ['breastmilk', 'formula', 'mixed'];
const QUICK_ML = [30, 60, 90, 120, 150] as const;

function parsePositiveInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function DurationField({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  const t = useT();
  return (
    <label className="field">
      {t('sheet.durationOptional')}
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={600}
        value={value ?? ''}
        onChange={(e) => onChange(parsePositiveInt(e.target.value))}
      />
    </label>
  );
}

export function BreastfeedForm({ value, onChange }: FormProps<BreastfeedInput>) {
  const t = useT();
  return (
    <>
      <fieldset>
        <legend>{t('sheet.side')}</legend>
        <div className="chips">
          {SIDES.map((side) => (
            <button key={side} type="button" className="chip" aria-pressed={value.side === side} onClick={() => onChange({ ...value, side })}>
              {t(`side.${side}.button`)}
            </button>
          ))}
        </div>
      </fieldset>
      <DurationField value={value.durationMin} onChange={(durationMin) => onChange({ ...value, durationMin })} />
    </>
  );
}

export function SleepForm({ value, onChange }: FormProps<SleepInput>) {
  return <DurationField value={value.durationMin} onChange={(durationMin) => onChange({ ...value, durationMin })} />;
}

export function BottleForm({ value, onChange }: FormProps<BottleInput>) {
  const t = useT();
  return (
    <>
      <label className="field">
        {t('sheet.amount')}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value.ml ?? ''}
          onChange={(e) => onChange({ ...value, ml: parsePositiveInt(e.target.value) })}
        />
      </label>
      <div className="chips">
        {QUICK_ML.map((ml) => (
          <button key={ml} type="button" className="chip" aria-pressed={value.ml === ml} onClick={() => onChange({ ...value, ml })}>
            {t('unit.ml', { ml })}
          </button>
        ))}
      </div>
      <fieldset>
        <legend>{t('bottle.contents')}</legend>
        <div className="chips">
          {CONTENTS.map((contents) => (
            <button
              key={contents}
              type="button"
              className="chip"
              aria-pressed={value.contents === contents}
              onClick={() => onChange({ ...value, contents })}
            >
              {t(`bottle.${contents}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** A multi-line note; optional on every entry, required on a health note. */
export function NoteField({ value, required, onChange }: { value: string; required: boolean; onChange: (next: string) => void }) {
  const t = useT();
  return (
    <label className="field">
      {t(required ? 'note.required' : 'note.optional')}
      <textarea
        rows={3}
        maxLength={TEXT_LIMITS.note}
        aria-required={required || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** The entry-type chips at the top of the "Diğer" sheet. */
export function OtherTypeChips({ value, onChange }: FormProps<OtherType>) {
  const t = useT();
  return (
    <fieldset>
      <legend>{t('other.type')}</legend>
      <div className="chips">
        {OTHER_TYPES.map((type) => (
          <button key={type} type="button" className="chip" aria-pressed={value === type} onClick={() => onChange(type)}>
            {t(`other.chip.${type}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

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

/**
 * A decimal field. type="text" because an iOS number field with the Turkish keypad reports "3,45" as an
 * empty value; inputMode="decimal" still brings up the keypad with the comma.
 */
function DecimalField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label className="field">
      {label}
      <input type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function GrowthForm({ value, onChange }: FormProps<GrowthInput>) {
  const t = useT();
  return (
    <>
      <DecimalField label={t('growth.weight')} value={value.weightKg} onChange={(weightKg) => onChange({ ...value, weightKg })} />
      <DecimalField label={t('growth.height')} value={value.heightCm} onChange={(heightCm) => onChange({ ...value, heightCm })} />
      <DecimalField label={t('growth.head')} value={value.headCm} onChange={(headCm) => onChange({ ...value, headCm })} />
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
      <DecimalField label={t('temperature.value')} value={value.celsius} onChange={(celsius) => onChange({ celsius })} />
      <p className="stool-alert" aria-live="polite" hidden={shown === null}>
        {shown === null ? '' : t(`temperature.alert.${shown}`)}
      </p>
    </>
  );
}

export function MedicationForm({ value, onChange, recent }: FormProps<MedicationInput> & { recent: readonly RecentMedication[] }) {
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
