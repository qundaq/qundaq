import { useState } from 'react';
import { startOfDay } from '../../domain/days';
import {
  DEFAULT_RANGE,
  isSingleDay,
  resolveRange,
  stepRange,
  type RangeChoice,
} from '../../domain/ranges';
import { useLocale, useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { useNow } from '../shared/useNow';
import { rangeLabel } from './describe';
import { RangeSheet } from './RangeSheet';
import styles from './Log.module.css';

/** The log (history) tab's date range, living in the brand row: the range's label opens the range sheet, and a
 * one-day range also steps by a day. Owns its own tick, like BrandDate, so the rest of the brand row does not
 * re-render on it. */
export function BrandRangePicker({
  range,
  onChange,
}: {
  range: RangeChoice;
  onChange: (next: RangeChoice) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const shown = resolveRange(range, now);
  const today = startOfDay(now);
  const single = isSingleDay(shown);
  const label = rangeLabel(t, locale, range, now);
  const step = (delta: -1 | 1) => {
    const next = stepRange(shown, delta, now);
    // A step onto today gives "today" again, which follows midnight.
    onChange(next.kind === 'custom' && next.from === today ? DEFAULT_RANGE : next);
  };
  return (
    <div className={styles.brandRangePicker} role="group" aria-label={t('range.title')}>
      {single && (
        <Button
          variant="tertiary"
          icon="chevron-left"
          className={styles.brandStep}
          aria-label={t('day.previous')}
          onClick={() => step(-1)}
        />
      )}
      <button
        type="button"
        className={styles.brandRangeCurrent}
        aria-label={`${t('range.title')}: ${label}`}
        aria-haspopup="dialog"
        data-testid="range-current"
        onClick={() => setOpen(true)}
      >
        <span className={styles.brandRangeLabel}>{label}</span>
      </button>
      {single && (
        <Button
          variant="tertiary"
          icon="chevron-right"
          className={styles.brandStep}
          aria-label={t('day.next')}
          disabled={shown.from >= today}
          onClick={() => step(1)}
        />
      )}
      <RangeSheet
        open={open}
        onClose={() => setOpen(false)}
        range={range}
        now={now}
        onChange={onChange}
      />
    </div>
  );
}
