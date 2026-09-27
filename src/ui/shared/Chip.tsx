import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import type { IconName } from './icons';
import styles from './Chip.module.css';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role'> {
  selected: boolean;
  mode?: 'toggle' | 'radio';
  icon?: IconName;
}

/** A pill for choices and filters. Selected: translucent primary fill, one notch quieter than the primary button. */
export function Chip({ selected, mode = 'toggle', icon, className, children, ...rest }: ChipProps) {
  const a11y =
    mode === 'radio' ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected };
  return (
    <button
      type="button"
      className={[styles.chip, selected ? styles.selected : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...a11y}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
