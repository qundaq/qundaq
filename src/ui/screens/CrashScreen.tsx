import { RestoreButton } from '../backup/RestoreButton';
import { useT } from '../I18nProvider';

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
      <h1>{t('crash.title')}</h1>
      <p>{t('crash.otherTabs')}</p>
      <p className="muted small crash-message">{error.message}</p>
      <div className="backup-actions">
        <button type="button" className="btn btn-primary" onClick={onBackup}>
          {t('backup.export')}
        </button>
        <RestoreButton onFile={onRestore} />
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {t('crash.reload')}
        </button>
      </div>
    </section>
  );
}
