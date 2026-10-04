import { useLocale, useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card, CardTitle } from '../shared/Card';
import { useNow } from '../shared/useNow';
import styles from './Backup.module.css';
import { RestoreButton } from './RestoreButton';
import { lastBackupText } from './text';

/** What the backup card can start. Shell owns the sheets, so Home and the crash screen can open them too. */
export interface BackupActions {
  onExport: () => void;
  onImportFile: (file: File) => void;
  onCsv: () => void;
}

export function BackupCard({
  lastBackupAt,
  actions,
}: {
  lastBackupAt: number | undefined;
  actions: BackupActions;
}) {
  const t = useT();
  const locale = useLocale();
  const now = useNow();
  return (
    <Card>
      <CardTitle>{t('backup.title')}</CardTitle>
      <p>{lastBackupText(t, locale, lastBackupAt, now)}</p>
      <p className={styles.hint}>{t('backup.hint')}</p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={actions.onExport}>
          {t('backup.export')}
        </Button>
        <RestoreButton onFile={actions.onImportFile} />
        <Button onClick={actions.onCsv}>{t('backup.csv')}</Button>
      </div>
    </Card>
  );
}
