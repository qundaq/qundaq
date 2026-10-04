import { addDays, fromDateInputValue, startOfDay, toDateInputValue } from '../../domain/days';
import { customRange, resolveRange, type RangeChoice, type RangePreset } from '../../domain/ranges';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import { Field } from '../shared/Field';
import { Sheet } from '../shared/Sheet';
import styles from './Log.module.css';

const PRESETS: readonly RangePreset[] = ['today', 'yesterday', 'last7', 'last30'];

interface Props {
  open: boolean;
  onClose: () => void;
  range: RangeChoice;
  now: number;
  onChange: (next: RangeChoice) => void;
}

/** The log (history) tab's date range: four quick ranges and a custom one, chosen live (no Save/Cancel —
 * closing keeps whatever is chosen). */
export function RangeSheet({ open, onClose, range, now, onChange }: Props) {
  const t = useT();
  const shown = resolveRange(range, now);
  const first = shown.from;
  const last = addDays(shown.to, -1);
  const today = toDateInputValue(startOfDay(now));
  // A quick range is lit whenever the range covers exactly its days, however it was picked.
  const covers = (preset: RangePreset) => {
    const quick = resolveRange({ kind: 'preset', preset }, now);
    return quick.from === shown.from && quick.to === shown.to;
  };
  // An empty or unparseable value (a cleared field) changes nothing. A start after the end moves the end
  // along; an end before the start moves the start (customRange does that one).
  const pickFrom = (value: string) => {
    const day = fromDateInputValue(value);
    if (day !== null) onChange(customRange(day, Math.max(day, last), now));
  };
  const pickTo = (value: string) => {
    const day = fromDateInputValue(value);
    if (day !== null) onChange(customRange(first, day, now));
  };
  return (
    <Sheet open={open} title={t('range.title')} onClose={onClose}>
      <div data-testid="range-sheet">
        <div className={styles.chips}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset}
              selected={covers(preset)}
              onClick={() => onChange({ kind: 'preset', preset })}
            >
              {t(`range.${preset}`)}
            </Chip>
          ))}
        </div>
        <fieldset className={styles.customRange}>
          <legend>{t('range.custom')}</legend>
          <div className={styles.rangeFields}>
            <Field label={t('range.from')}>
              <input
                type="date"
                value={toDateInputValue(first)}
                max={today}
                onChange={(event) => pickFrom(event.target.value)}
              />
            </Field>
            <Field label={t('range.to')}>
              <input
                type="date"
                value={toDateInputValue(last)}
                max={today}
                onChange={(event) => pickTo(event.target.value)}
              />
            </Field>
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}
