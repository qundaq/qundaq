import { TEXT_LIMITS } from '../../../domain/rules';
import { useT } from '../../app/I18nProvider';
import { typeIcon } from '../../history/describe';
import { Chip } from '../../shared/Chip';
import { Field } from '../../shared/Field';
import { OTHER_TYPES, type OtherType } from '../drafts';
import styles from '../LogSheet.module.css';

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
    <Field label={t('sheet.durationOptional')}>
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

/** A multi-line note; optional on every entry, required on a health note. */
export function NoteField({
  value,
  required,
  onChange,
}: {
  value: string;
  required: boolean;
  onChange: (next: string) => void;
}) {
  const t = useT();
  return (
    <Field label={t(required ? 'note.required' : 'note.optional')}>
      <textarea
        rows={3}
        maxLength={TEXT_LIMITS.note}
        aria-required={required || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** The entry-type chips at the top of the "Diğer" sheet. */
export function OtherTypeChips({ value, onChange }: FormProps<OtherType>) {
  const t = useT();
  return (
    <fieldset>
      <legend>{t('other.type')}</legend>
      <div className={styles.chips}>
        {OTHER_TYPES.map((type) => (
          <Chip
            key={type}
            icon={typeIcon(type)}
            selected={value === type}
            onClick={() => onChange(type)}
          >
            {t(`other.chip.${type}`)}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
