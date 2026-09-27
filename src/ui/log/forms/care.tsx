import { useId } from 'react';
import { STOOL_COLORS, stoolAlert } from '../../../domain/stool';
import type { BottleContents, Consistency, Side } from '../../../domain/types';
import { useT } from '../../app/I18nProvider';
import { Chip } from '../../shared/Chip';
import { Field } from '../../shared/Field';
import type { BottleInput, BreastfeedInput, DiaperInput, SleepInput } from '../drafts';
import styles from '../LogSheet.module.css';
import { DurationField, parsePositiveInt, type FormProps } from './fields';

const CONSISTENCIES: readonly Consistency[] = ['watery', 'soft', 'formed', 'hard'];

export function DiaperForm({ value, onChange }: FormProps<DiaperInput>) {
  const t = useT();
  const stoolGroup = useId();
  const alert = value.dirty ? stoolAlert(value.stoolColor ?? undefined) : null;
  return (
    <>
      <fieldset>
        <legend>{t('diaper.kind')}</legend>
        <div className={styles.chips}>
          <Chip selected={value.wet} onClick={() => onChange({ ...value, wet: !value.wet })}>
            {t('diaper.wet.button')}
          </Chip>
          <Chip selected={value.dirty} onClick={() => onChange({ ...value, dirty: !value.dirty })}>
            {t('diaper.dirty.button')}
          </Chip>
        </div>
      </fieldset>
      {value.dirty && (
        <>
          <fieldset>
            <legend>{t('stool.color')}</legend>
            <div className={styles.swatches}>
              {STOOL_COLORS.map((color) => (
                <label key={color.id} className={styles.swatch} style={{ background: color.hex }}>
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
            <p role="alert" className={styles.stoolAlert}>
              {t(`stool.alert.${alert}`)}
            </p>
          )}
          <fieldset>
            <legend>{t('stool.consistency')}</legend>
            <div className={styles.chips}>
              {CONSISTENCIES.map((c) => (
                <Chip
                  key={c}
                  selected={value.consistency === c}
                  onClick={() => onChange({ ...value, consistency: c })}
                >
                  {t(`consistency.${c}`)}
                </Chip>
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

export function BreastfeedForm({ value, onChange }: FormProps<BreastfeedInput>) {
  const t = useT();
  return (
    <>
      <fieldset>
        <legend>{t('sheet.side')}</legend>
        <div className={styles.chips}>
          {SIDES.map((side) => (
            <Chip
              key={side}
              selected={value.side === side}
              onClick={() => onChange({ ...value, side })}
            >
              {t(`side.${side}.button`)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <DurationField
        value={value.durationMin}
        onChange={(durationMin) => onChange({ ...value, durationMin })}
      />
    </>
  );
}

export function SleepForm({ value, onChange }: FormProps<SleepInput>) {
  return (
    <DurationField
      value={value.durationMin}
      onChange={(durationMin) => onChange({ ...value, durationMin })}
    />
  );
}

export function BottleForm({ value, onChange }: FormProps<BottleInput>) {
  const t = useT();
  return (
    <>
      <Field label={t('sheet.amount')}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value.ml ?? ''}
          onChange={(e) => onChange({ ...value, ml: parsePositiveInt(e.target.value) })}
        />
      </Field>
      <div className={styles.chips}>
        {QUICK_ML.map((ml) => (
          <Chip key={ml} selected={value.ml === ml} onClick={() => onChange({ ...value, ml })}>
            {t('unit.ml', { ml })}
          </Chip>
        ))}
      </div>
      <fieldset>
        <legend>{t('bottle.contents')}</legend>
        <div className={styles.chips}>
          {CONTENTS.map((contents) => (
            <Chip
              key={contents}
              selected={value.contents === contents}
              onClick={() => onChange({ ...value, contents })}
            >
              {t(`bottle.${contents}`)}
            </Chip>
          ))}
        </div>
      </fieldset>
    </>
  );
}
