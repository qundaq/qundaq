import { fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import { useT } from '../I18nProvider';
import { useNow } from '../useNow';
import { editedOptionalTime, editedTime } from './drafts';

/**
 * `null` means "now": the field shows the current time, and the entry is stamped with the moment it is
 * saved. Only a time the user actually picked is kept as a number.
 */
export function TimeField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  useNow(); // keeps the displayed "now" current while the sheet stays open
  return (
    <div className="time-field">
      <label className="field">
        {t('sheet.time')}
        <input
          type="datetime-local"
          value={toLocalInputValue(value ?? Date.now())}
          onChange={(e) => onChange(fromLocalInputValue(e.target.value))}
        />
      </label>
      <button type="button" className="btn" onClick={() => onChange(null)}>
        {t('sheet.now')}
      </button>
    </div>
  );
}

/**
 * The edit sheet's time: always a concrete instant. It changes only to a new value that parses, so an
 * untouched field keeps the stored seconds and an emptied field (iOS has a Clear button) changes nothing.
 * `stored` is the entry's saved time: showing it again restores it exactly. "Şimdi" sets the current time.
 */
export function EditTimeField({
  label,
  value,
  stored,
  onChange,
}: {
  label: string;
  value: number;
  stored?: number;
  onChange: (next: number) => void;
}) {
  const t = useT();
  return (
    <div className="time-field">
      <label className="field">
        {label}
        <input
          type="datetime-local"
          value={toLocalInputValue(value)}
          onChange={(e) => onChange(editedTime(e.target.value, value, stored))}
        />
      </label>
      <button type="button" className="btn" onClick={() => onChange(Date.now())}>
        {t('sheet.now')}
      </button>
    </div>
  );
}

/** A running timer's optional end: empty means still running; a time finishes it when the sheet is saved. */
export function OptionalTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  return (
    <div className="time-field">
      <label className="field">
        {label}
        <input
          type="datetime-local"
          value={value === null ? '' : toLocalInputValue(value)}
          onChange={(e) => onChange(editedOptionalTime(e.target.value, value))}
        />
      </label>
      <button type="button" className="btn" onClick={() => onChange(Date.now())}>
        {t('sheet.now')}
      </button>
    </div>
  );
}
