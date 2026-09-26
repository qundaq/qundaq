import { buildBackup, countLive, serializeBackup } from '../../backup/export';
import { BACKUP_MIME, backupFileName } from '../../backup/format';
import { readSnapshot } from '../../db/backup';
import { db } from '../../db/instance';
import type { Locale } from '../../i18n';
import { formatNumber } from '../history/describe';
import type { TranslateFn } from '../I18nProvider';
import { countsAsBackup, fileSize } from './text';

/** Files ready to share, prepared before the share tap: async work inside the tap would lose its user activation. */
export interface Prepared {
  files: File[];
  summary: string; // "2 bebek · 1.234 kayıt · 180 KB"
  countsAsBackup: boolean; // only a JSON backup sets lastBackupAt
}

export async function prepareBackup(t: TranslateFn, locale: Locale, now = Date.now()): Promise<Prepared> {
  const snapshot = await readSnapshot(db, locale);
  const text = serializeBackup(buildBackup(snapshot, { exportedAt: now, appVersion: __APP_VERSION__ }));
  const file = new File([text], backupFileName(now), { type: BACKUP_MIME });
  const summary = t('export.contents', {
    babies: formatNumber(locale, countLive(snapshot.babies)),
    events: formatNumber(locale, countLive(snapshot.events)),
    size: fileSize(t, locale, file.size),
  });
  return { files: [file], summary, countsAsBackup: countsAsBackup('json') };
}
