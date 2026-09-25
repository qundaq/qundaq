import { STOOL_COLORS, stoolAlert } from '../../domain/stool';
import type { BottleContents, Consistency, Side } from '../../domain/types';
import { useT } from '../I18nProvider';
import type { BottleInput, BreastfeedInput, DiaperInput, SleepInput } from './drafts';

const CONSISTENCIES: readonly Consistency[] = ['watery', 'soft', 'formed', 'hard'];

interface FormProps<T> {
  value: T;
  onChange: (next: T) => void;
}

export function DiaperForm({ value, onChange }: FormProps<DiaperInput>) {
  const t = useT();
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
            <div className="swatches" role="radiogroup" aria-label={t('stool.color')}>
              {STOOL_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  role="radio"
                  aria-checked={value.stoolColor === color.id}
                  aria-label={t(`stool.color.${color.id}`)}
                  className="swatch"
                  style={{ background: color.hex }}
                  onClick={() => onChange({ ...value, stoolColor: color.id })}
                />
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
            {ml}
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
