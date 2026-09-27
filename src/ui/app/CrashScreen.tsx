import { RestoreButton } from '../backup/RestoreButton';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import styles from './CrashScreen.module.css';
import { useT } from './I18nProvider';

interface Props {
  error: Error;
  onBackup: () => void;
  /** Restoring (after a backup) replaces bad rows, even when the crashed screen is Ayarlar itself. */
  onRestore: (file: File) => void;
}

/** Shown in place of a screen that crashed. The backup sheets read the database themselves, so they still work. */
export function CrashScreen({ error, onBackup, onRestore }: Props) {
  const t = useT();
  return (
    <section>
      <Card tone="danger">
        <h1>{t('crash.title')}</h1>
        <p>{t('crash.otherTabs')}</p>
        <p className={styles.message}>{error.message}</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onBackup}>
            {t('backup.export')}
          </Button>
          <RestoreButton onFile={onRestore} />
          <Button onClick={() => window.location.reload()}>{t('crash.reload')}</Button>
        </div>
      </Card>
    </section>
  );
}
