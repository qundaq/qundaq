import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { backupAgo } from './text';
import styles from './Backup.module.css';

interface Props {
  daysSince: number | null; // null: never backed up
  onBackup: () => void;
  onSnooze: () => void;
}

/** Home's reminder: iOS may delete the app's storage, and the entries exist nowhere else. */
export function BackupBanner({ daysSince, onBackup, onSnooze }: Props) {
  const t = useT();
  return (
    <Card
      as="section"
      tone={daysSince !== null && daysSince >= 14 ? 'danger' : 'info'}
      aria-label={t('reminder.label')}
    >
      <p className={styles.reminderText}>
        {daysSince === null
          ? t('reminder.never')
          : t('reminder.since', { ago: backupAgo(t, daysSince) })}
      </p>
      <div className={styles.row}>
        <Button variant="tertiary" onClick={onSnooze}>
          {t('reminder.snooze')}
        </Button>
        <Button variant="secondary" onClick={onBackup}>
          {t('backup.export')}
        </Button>
      </div>
    </Card>
  );
}
