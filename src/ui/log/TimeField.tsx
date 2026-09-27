import { toLocalInputValue } from '../../domain/time';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Field } from '../shared/Field';
import { editedOptionalTime, editedTime } from './edits';
import styles from './LogSheet.module.css';

/**
 * The edit sheet's time: always a concrete instant. It changes only to a new value that parses, so an
 * untouched field keeps the stored seconds and an emptied field (iOS has a Clear button) changes nothing.
 * `stored` is the entry's saved time: showing it again restores it exactly. "Now" (sheet.now) sets the current time.
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
    <div className={styles.timeField}>
      <Field label={label}>
        <input
          type="datetime-local"
          value={toLocalInputValue(value)}
          onChange={(e) => onChange(editedTime(e.target.value, value, stored))}
        />
      </Field>
      <Button onClick={() => onChange(Date.now())}>{t('sheet.now')}</Button>
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
    <div className={styles.timeField}>
      <Field label={label}>
        <input
          type="datetime-local"
          value={value === null ? '' : toLocalInputValue(value)}
          onChange={(e) => onChange(editedOptionalTime(e.target.value, value))}
        />
      </Field>
      <Button onClick={() => onChange(Date.now())}>{t('sheet.now')}</Button>
    </div>
  );
}
