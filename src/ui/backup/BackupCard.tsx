import { useLocale, useT } from '../app/I18nProvider';
import { useNow } from '../shared/useNow';
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
    <div className="card">
      <h2>{t('backup.title')}</h2>
      <p>{lastBackupText(t, locale, lastBackupAt, now)}</p>
      <p className="muted small">{t('backup.hint')}</p>
      <div className="backup-actions">
        <button type="button" className="btn btn-primary" onClick={actions.onExport}>
          {t('backup.export')}
        </button>
        <RestoreButton onFile={actions.onImportFile} />
        <button type="button" className="btn" onClick={actions.onCsv}>
          {t('backup.csv')}
        </button>
      </div>
    </div>
  );
}
