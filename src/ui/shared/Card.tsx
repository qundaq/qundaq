import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  accent?: string;
  tone?: 'default' | 'info' | 'danger';
}

export function Card({
  as: Tag = 'div',
  accent,
  tone = 'default',
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const classes = cx(
    styles.card,
    accent ? styles.accent : '',
    tone !== 'default' ? styles[tone] : '',
    className ?? '',
  );
  return (
    <Tag
      className={classes}
      style={accent ? { ...style, borderLeftColor: accent } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
