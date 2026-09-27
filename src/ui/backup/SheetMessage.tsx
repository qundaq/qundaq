import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import styles from './Backup.module.css';

/** A sheet's failure: the message and a button that closes the sheet. */
export function SheetMessage({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <>
      <p role="alert" className={styles.warn}>
        {message}
      </p>
      <div className={styles.sheetActions}>
        <Button onClick={onClose}>{t('common.dismiss')}</Button>
      </div>
    </>
  );
}
