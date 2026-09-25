import { STOOL_COLORS, stoolAlert } from '../../domain/stool';
import type { Consistency } from '../../domain/types';
import { useT } from '../I18nProvider';
import type { DiaperInput } from './drafts';

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
