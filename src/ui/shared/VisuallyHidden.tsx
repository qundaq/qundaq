import type { ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

/** In the accessibility tree, not on screen: the screen's h1 after the brand row replaced the visible title. */
export function VisuallyHidden({
  as: Tag = 'span',
  children,
}: {
  as?: 'span' | 'h1' | 'h2';
  children: ReactNode;
}) {
  return <Tag className={styles.hidden}>{children}</Tag>;
}
