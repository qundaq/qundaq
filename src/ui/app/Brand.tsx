import type { ReactNode } from 'react';
import type { Locale } from '../../i18n';
import { brandDate } from '../shared/format';
import { useNow } from '../shared/useNow';
import styles from './Brand.module.css';

/** The brand row's date context: only this re-renders every 30 s, not the whole app. */
export function BrandDate({ locale }: { locale: Locale }) {
  const now = useNow();
  return brandDate(locale, now);
}

/** The row every screen starts with: the mark, the name, and the screen's context (a date, a day) on the right. */
export function Brand({ context }: { context?: ReactNode }) {
  return (
    <header className={styles.brand}>
      <span className={styles.name}>
        <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M9 7.5c-2.2 1.6-2.6 5.2-.6 7.6 1.6 2 4.6 2.4 6.6.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14.5 8.5a3 3 0 0 1 0 6"
            fill="none"
            stroke="var(--info)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Qundaq
      </span>
      {context && <div className={styles.context}>{context}</div>}
    </header>
  );
}
