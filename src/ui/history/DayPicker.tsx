import { fromDateInputValue, resolveDay, startOfDay, stepDay, toDateInputValue } from '../../domain/days';
import { useLocale, useT } from '../I18nProvider';
import { dayLabel } from './describe';

interface Props {
  day: number | null; // null: today, which follows midnight
  now: number;
  onChange: (next: number | null) => void;
}

/**
 * "‹ Bugün ›". The label is also a native date field: a transparent <input type="date"> covers it, because
 * iOS opens its picker only on a real tap on the input.
 */
export function DayPicker({ day, now, onChange }: Props) {
  const t = useT();
  const locale = useLocale();
  const shown = resolveDay(day, now);
  const today = startOfDay(now);

  const pick = (value: string) => {
    const picked = fromDateInputValue(value);
    if (picked === null) return; // '' from the Clear button, or nothing parseable
    onChange(picked >= today ? null : picked);
  };

  return (
    <div className="day-picker" role="group" aria-label={t('day.label')}>
      <button type="button" className="btn day-step" aria-label={t('day.previous')} onClick={() => onChange(stepDay(day, now, -1))}>
        ‹
      </button>
      <label className="day-current">
        <span>{dayLabel(t, locale, shown, now)}</span>
        <input
          type="date"
          aria-label={t('day.choose')}
          value={toDateInputValue(shown)}
          max={toDateInputValue(today)}
          onChange={(event) => pick(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn day-step"
        aria-label={t('day.next')}
        disabled={shown >= today}
        onClick={() => onChange(stepDay(day, now, 1))}
      >
        ›
      </button>
    </div>
  );
}
