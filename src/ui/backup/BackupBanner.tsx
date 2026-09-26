import { useT } from '../I18nProvider';
import { backupAgo } from './text';

interface Props {
  daysSince: number | null; // null: never backed up
  onBackup: () => void;
  onSnooze: () => void;
}

/** Home's reminder: iOS may delete the app's storage, and the entries exist nowhere else. */
export function BackupBanner({ daysSince, onBackup, onSnooze }: Props) {
  const t = useT();
  return (
    <section className="card backup-banner" aria-label={t('reminder.label')}>
      <p>
        {daysSince === null
          ? t('reminder.never')
          : t('reminder.since', { ago: backupAgo(t, daysSince) })}
      </p>
      <div className="timer-row">
        <button type="button" className="btn" onClick={onSnooze}>
          {t('reminder.snooze')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onBackup}>
          {t('backup.export')}
        </button>
      </div>
    </section>
  );
}
