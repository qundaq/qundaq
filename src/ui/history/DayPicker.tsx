import { resolveDay, startOfDay, stepDay, toDateInputValue } from '../../domain/days';
import { useLocale, useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { dayLabel, resolveDayInputChange } from './describe';
import styles from './Log.module.css';

interface Props {
  day: number | null; // null: today, which follows midnight
  now: number;
  onChange: (next: number | null) => void;
}

/**
 * "‹ Today ›" (day.today). The label is also a native date field: a transparent <input type="date"> covers it, because
 * iOS opens its picker only on a real tap on the input.
 */
export function DayPicker({ day, now, onChange }: Props) {
  const t = useT();
  const locale = useLocale();
  const shown = resolveDay(day, now);
  const today = startOfDay(now);

  const pick = (value: string) => {
    const next = resolveDayInputChange(value, today);
    if (next !== undefined) onChange(next);
  };

  return (
    <div className={styles.dayPicker} role="group" aria-label={t('day.label')}>
      <Button
        icon="chevron-left"
        aria-label={t('day.previous')}
        onClick={() => onChange(stepDay(day, now, -1))}
      />
      <label className={styles.dayCurrent} data-testid="day-current">
        <span>{dayLabel(t, locale, shown, now)}</span>
        <input
          type="date"
          aria-label={t('day.choose')}
          value={toDateInputValue(shown)}
          max={toDateInputValue(today)}
          onChange={(event) => pick(event.target.value)}
        />
      </label>
      <Button
        icon="chevron-right"
        aria-label={t('day.next')}
        disabled={shown >= today}
        onClick={() => onChange(stepDay(day, now, 1))}
      />
    </div>
  );
}
