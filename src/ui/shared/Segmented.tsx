import { useId } from 'react';
import { cx } from './cx';
import { onRadioKeyDown } from './radio';
import styles from './Segmented.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  /** The label stays for assistive tech only (a sheet whose title already says it). */
  hideLabel?: boolean;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Two to four equal segments, exactly one chosen: a radio group with one tab stop and arrow keys. */
export function Segmented<T extends string>({
  label,
  hideLabel,
  options,
  value,
  onChange,
}: Props<T>) {
  const labelId = useId();
  return (
    <div className={styles.field}>
      <span id={labelId} className={cx(styles.label, hideLabel && styles.hidden)}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.group}>
        {options.map((option, i) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={cx(styles.segment, checked && styles.checked)}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) =>
                onRadioKeyDown(event, i, options.length, (j) => onChange(options[j]!.value))
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
