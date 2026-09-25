import { toLocalInputValue } from '../../domain/time';
import { useT } from '../I18nProvider';

export function TimeField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useT();
  return (
    <div className="time-field">
      <label className="field">
        {t('sheet.time')}
        <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <button type="button" className="btn" onClick={() => onChange(toLocalInputValue(Date.now()))}>
        {t('sheet.now')}
      </button>
    </div>
  );
}
