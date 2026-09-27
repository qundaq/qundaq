import { useId } from 'react';
import { STOOL_COLORS, STOOL_GROUPS, stoolAlert } from '../../../domain/stool';
import type { BottleContents, Consistency, StoolColor } from '../../../domain/types';
import { useT } from '../../app/I18nProvider';
import { Button } from '../../shared/Button';
import { Chip } from '../../shared/Chip';
import { cx } from '../../shared/cx';
import { Icon } from '../../shared/Icon';
import { onRadioKeyDown } from '../../shared/radio';
import { Segmented } from '../../shared/Segmented';
import type { BottleInput, DiaperInput } from '../drafts';
import styles from '../LogSheet.module.css';
import { parsePositiveInt, type FormProps } from './fields';

const CONSISTENCIES: readonly Consistency[] = ['watery', 'soft', 'formed', 'hard'];

export type DiaperKind = 'wet' | 'dirty' | 'both';
const DIAPER_KINDS: readonly DiaperKind[] = ['wet', 'dirty', 'both'];

/** The segment the diaper's wet/dirty flags currently show. */
export function diaperKind(value: DiaperInput): DiaperKind {
  if (value.wet && value.dirty) return 'both';
  return value.dirty ? 'dirty' : 'wet';
}

/** The segment's choice as wet/dirty; stool details go when the diaper is no longer dirty. */
export function withDiaperKind(value: DiaperInput, kind: DiaperKind): DiaperInput {
  const dirty = kind !== 'wet';
  return {
    wet: kind !== 'dirty',
    dirty,
    stoolColor: dirty ? value.stoolColor : null,
    consistency: dirty ? value.consistency : null,
  };
}

function hexOf(color: StoolColor): string {
  return STOOL_COLORS.find((c) => c.id === color)!.hex;
}

export function DiaperForm({ value, onChange }: FormProps<DiaperInput>) {
  const t = useT();
  const stoolGroup = useId();
  const askDoctorId = useId();
  const consistencyLabelId = useId();
  const alert = value.dirty ? stoolAlert(value.stoolColor ?? undefined) : null;
  const focusableConsistency =
    value.consistency === null ? 0 : CONSISTENCIES.indexOf(value.consistency);

  const swatch = (color: StoolColor, doctor: boolean) => {
    const checked = value.stoolColor === color;
    return (
      <label key={color} className={styles.swatch}>
        <input
          type="radio"
          name={stoolGroup}
          value={color}
          // The doctor-group colours are described by the ask-a-doctor line above them (stool.askDoctor).
          aria-describedby={doctor ? askDoctorId : undefined}
          checked={checked}
          onChange={() => onChange({ ...value, stoolColor: color })}
          onClick={() => {
            if (checked) onChange({ ...value, stoolColor: null });
          }}
        />
        <span className={styles.swatchBar} style={{ background: hexOf(color) }} />
        <span className={styles.swatchName}>{t(`stool.color.${color}`)}</span>
      </label>
    );
  };

  return (
    <>
      <Segmented
        label={t('diaper.kind')}
        options={DIAPER_KINDS.map((kind) => ({ value: kind, label: t(`diaper.${kind}.button`) }))}
        value={diaperKind(value)}
        onChange={(kind) => onChange(withDiaperKind(value, kind))}
      />
      {value.dirty && (
        <>
          <fieldset>
            <legend>{t('stool.colorOptional')}</legend>
            <div className={styles.swatches}>
              {STOOL_GROUPS.usual.map((color) => swatch(color, false))}
            </div>
            <p id={askDoctorId} className={styles.askDoctor}>
              <Icon name="triangle-alert" size={16} />
              {t('stool.askDoctor')}
            </p>
            <div className={cx(styles.swatches, styles.swatchesDoctor)}>
              {STOOL_GROUPS.doctor.map((color) => swatch(color, true))}
            </div>
          </fieldset>
          {alert && (
            <p role="alert" className={styles.stoolAlert}>
              {t(`stool.alert.${alert}`)}
            </p>
          )}
          <div className={styles.group}>
            <span id={consistencyLabelId} className={styles.groupLabel}>
              {t('stool.consistency')}
            </span>
            <div role="radiogroup" aria-labelledby={consistencyLabelId} className={styles.chips}>
              {CONSISTENCIES.map((c, i) => (
                <Chip
                  key={c}
                  mode="radio"
                  selected={value.consistency === c}
                  tabIndex={i === focusableConsistency ? 0 : -1}
                  onClick={() =>
                    onChange({ ...value, consistency: value.consistency === c ? null : c })
                  }
                  onKeyDown={(event) =>
                    onRadioKeyDown(event, i, CONSISTENCIES.length, (j) =>
                      onChange({ ...value, consistency: CONSISTENCIES[j]! }),
                    )
                  }
                >
                  {t(`consistency.${c}`)}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

const CONTENTS: readonly BottleContents[] = ['breastmilk', 'formula', 'mixed'];
const QUICK_ML: readonly number[] = [60, 90, 120, 150, 180];
const AMOUNT_STEP = 10;
const AMOUNT_MIN = 10;
const AMOUNT_MAX = 1000;
const AMOUNT_DEFAULT = 60;

export interface BottleFormProps extends FormProps<BottleInput> {
  /** The baby's latest bottle, or null with no history: shown as a caption and prefilled by the sheet. */
  last: { ml: number; contents: BottleContents } | null;
}

export function BottleForm({ value, onChange, last }: BottleFormProps) {
  const t = useT();
  const amountLabelId = useId();
  const chosen = value.ml === null ? -1 : QUICK_ML.indexOf(value.ml);
  const focusable = chosen === -1 ? 0 : chosen;
  const stepDown = () => {
    if (value.ml === null) return;
    onChange({ ...value, ml: Math.max(AMOUNT_MIN, value.ml - AMOUNT_STEP) });
  };
  const stepUp = () =>
    onChange({
      ...value,
      ml: value.ml === null ? AMOUNT_DEFAULT : Math.min(AMOUNT_MAX, value.ml + AMOUNT_STEP),
    });
  return (
    <>
      <div className={styles.group}>
        <span id={amountLabelId} className={styles.groupLabel}>
          {t('bottle.amount')}
          {last && ` · ${t('bottle.last', { ml: last.ml })}`}
        </span>
        <div className={styles.stepper}>
          <Button icon="minus" aria-label={t('bottle.less')} onClick={stepDown} />
          <input
            type="number"
            inputMode="numeric"
            min={AMOUNT_MIN}
            max={AMOUNT_MAX}
            aria-label={t('sheet.amount')}
            className={styles.amountInput}
            value={value.ml ?? ''}
            onChange={(e) => onChange({ ...value, ml: parsePositiveInt(e.target.value) })}
          />
          <Button icon="plus" aria-label={t('bottle.more')} onClick={stepUp} />
        </div>
        <div role="radiogroup" aria-labelledby={amountLabelId} className={styles.chips}>
          {QUICK_ML.map((ml, i) => (
            <Chip
              key={ml}
              mode="radio"
              selected={value.ml === ml}
              tabIndex={i === focusable ? 0 : -1}
              onClick={() => onChange({ ...value, ml })}
              onKeyDown={(event) =>
                onRadioKeyDown(event, i, QUICK_ML.length, (j) =>
                  onChange({ ...value, ml: QUICK_ML[j]! }),
                )
              }
            >
              {t('unit.ml', { ml })}
            </Chip>
          ))}
        </div>
      </div>
      <Segmented
        label={t('bottle.contents')}
        options={CONTENTS.map((contents) => ({ value: contents, label: t(`bottle.${contents}`) }))}
        value={value.contents}
        onChange={(contents) => onChange({ ...value, contents })}
      />
    </>
  );
}
