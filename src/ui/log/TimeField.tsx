import { fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import { useT } from '../I18nProvider';
import { useNow } from '../useNow';

/**
 * `null` means "now": the field shows the current time, and the entry is stamped with the moment it is
 * saved. Only a time the user actually picked is kept as a number.
 */
export function TimeField({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
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
