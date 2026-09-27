import { TEXT_LIMITS } from '../../../domain/rules';
import { useT } from '../../app/I18nProvider';
import { Field } from '../../shared/Field';

export interface FormProps<T> {
  value: T;
  onChange: (next: T) => void;
}

export function parsePositiveInt(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function DurationField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const t = useT();
  return (
    <Field label={t('sheet.durationMinutes')}>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={600}
        value={value ?? ''}
        onChange={(e) => onChange(parsePositiveInt(e.target.value))}
      />
    </Field>
  );
}

/**
 * A decimal field. type="text" because an iOS number field with the Turkish keypad reports "3,45" as an
 * empty value; inputMode="decimal" still brings up the keypad with the comma.
 */
export function DecimalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/**
 * A multi-line note; optional on every entry, required on a health note. `autoFocus` is set only when the
 * field has just been revealed by the note.add button, never on a health note, which shows it from the
 * start.
 */
export function NoteField({
  value,
  required,
  autoFocus,
  onChange,
}: {
  value: string;
  required: boolean;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  const t = useT();
  return (
    <Field label={t(required ? 'note.required' : 'note.optional')}>
      <textarea
        rows={3}
        maxLength={TEXT_LIMITS.note}
        aria-required={required || undefined}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
