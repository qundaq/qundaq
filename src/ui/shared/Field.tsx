import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import styles from './Field.module.css';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** Label above, control below, hint and error under it. The label wraps the control, so a tap anywhere focuses it. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const control =
    describedBy && isValidElement(children)
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': describedBy,
        })
      : children;
  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label className={styles.control}>
        <span className={styles.label}>{label}</span>
        {control}
      </label>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
