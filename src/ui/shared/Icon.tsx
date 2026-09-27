import { ICONS, type IconName } from './icons';
import styles from './Icon.module.css';

interface Props {
  name: IconName;
  size?: 16 | 20 | 24;
  /** Makes the icon meaningful on its own (role img); leave out when a text label sits next to it. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 20, label, className }: Props) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      // Static markup from icons.ts (a compile-time constant), never user input.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
