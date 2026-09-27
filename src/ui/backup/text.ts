import { believable, daysSinceBackup } from '../../backup/reminder';
import { DAY } from '../../domain/time';
import type { Locale } from '../../i18n';
import { clockTime, formatNumber, shortDate } from '../history/describe';
import type { TranslateFn } from '../app/I18nProvider';

const KB = 1024;
const MB = 1024 * KB;

/** "180 KB" (rounded up, at least 1) below a megabyte, "4,2 MB" above. */
export function fileSize(t: TranslateFn, locale: Locale, bytes: number): string {
  if (bytes < MB)
    return t('unit.kb', { n: formatNumber(locale, Math.max(1, Math.ceil(bytes / KB))) });
  return t('unit.mb', { n: formatNumber(locale, bytes / MB, 1) });
}

/** backup.today, backup.yesterday, backup.daysAgo ("today", "yesterday", "3 days ago"). */
export function backupAgo(t: TranslateFn, days: number): string {
  if (days === 0) return t('backup.today');
  if (days === 1) return t('backup.yesterday');
  return t('backup.daysAgo', { n: days });
}

/**
 * backup.last ("last backup: 3 days ago (Sep 23 21:40)") or backup.never ("no backup yet"). A time more
 * than a day ahead counts as no backup, as for Home's reminder.
 */
export function lastBackupText(
  t: TranslateFn,
  locale: Locale,
  lastBackupAt: number | undefined,
  now: number,
): string {
  const last = believable(lastBackupAt, now + DAY);
  if (last === undefined) return t('backup.never');
  const ago = backupAgo(t, daysSinceBackup(last, now));
  return t('backup.last', { ago, date: `${shortDate(locale, last)} ${clockTime(locale, last)}` });
}

/** What the export sheet makes. json: the backup. csv: spreadsheets for the pediatrician. */
export type ExportKind = 'json' | 'csv';

/** Only a JSON backup sets lastBackupAt (R6): a CSV cannot be restored. */
export function countsAsBackup(kind: ExportKind): boolean {
  return kind === 'json';
}
