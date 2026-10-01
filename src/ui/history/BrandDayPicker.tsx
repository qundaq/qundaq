import {
  fromDateInputValue,
  resolveDay,
  startOfDay,
  stepDay,
  toDateInputValue,
} from '../../domain/days';
import { useLocale, useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { useNow } from '../shared/useNow';
import { pickedDay } from './DayPicker';
import { dayLabelShort } from './describe';
import styles from './Log.module.css';

/** The log (history) tab's day picker, living in the brand row instead of its own full-width block. Owns
 * its own tick, like BrandDate, so the rest of the brand row does not re-render on it. */
export function BrandDayPicker({
  day,
  onChange,
}: {
  day: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const now = useNow();
  const shown = resolveDay(day, now);
  const today = startOfDay(now);
  const pick = (value: string) => {
    if (fromDateInputValue(value) === null) return;
    onChange(pickedDay(value, today));
  };
  return (
    <div className={styles.brandDayPicker} role="group" aria-label={t('day.label')}>
      <Button
        variant="tertiary"
        icon="chevron-left"
        className={styles.brandDayButton}
        aria-label={t('day.previous')}
        onClick={() => onChange(stepDay(day, now, -1))}
      />
      <label className={styles.brandDayCurrent} data-testid="day-current">
        <span>{dayLabelShort(t, locale, shown, now)}</span>
        <input
          type="date"
          aria-label={t('day.choose')}
          value={toDateInputValue(shown)}
          max={toDateInputValue(today)}
          onChange={(event) => pick(event.target.value)}
        />
      </label>
      <Button
        variant="tertiary"
        icon="chevron-right"
        className={styles.brandDayButton}
        aria-label={t('day.next')}
        disabled={shown >= today}
        onClick={() => onChange(stepDay(day, now, 1))}
      />
    </div>
  );
}
