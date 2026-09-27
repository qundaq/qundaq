import styles from './Backup.module.css';

/** A sheet's failure: the message. The header's close button dismisses the sheet. */
export function SheetMessage({ message }: { message: string }) {
  return (
    <p role="alert" className={styles.warn}>
      {message}
    </p>
  );
}
