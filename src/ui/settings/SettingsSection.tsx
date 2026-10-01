import type { ReactNode } from 'react';
import styles from './Settings.module.css';

/** A labelled group of Ayarlar cards — visual hierarchy instead of ten equally-weighted boxes. */
export function SettingsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionLabel}>{label}</h2>
      {children}
    </section>
  );
}
