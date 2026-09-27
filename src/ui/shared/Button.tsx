import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import type { IconName } from './icons';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
  /** Danger only: the two-step delete's "tap again" state; the label changes too, never colour alone. */
  armed?: boolean;
}

/** The one button. Rule: at most one `primary` button per region — a screen, a sheet, or a card that owns an action (a baby card with a running timer). */
export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  armed,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'lg' ? styles.lg : '',
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} data-armed={armed ? 'true' : undefined} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
