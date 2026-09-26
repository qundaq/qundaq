import { buildCsvFiles, csvSeparatorFor } from '../../backup/csv';
import { buildBackup, countLive, serializeBackup } from '../../backup/export';
import { BACKUP_MIME, backupFileName } from '../../backup/format';
import { readSnapshot } from '../../db/backup';
import { db } from '../../db/instance';
import type { Locale, MessageKey } from '../../i18n';
import { describeEvent, formatNumber, typeLabel } from '../history/describe';
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

const CSV_HEADERS: readonly MessageKey[] = [
  'csv.col.date',
  'csv.col.start',
  'csv.col.endDate',
  'csv.col.endTime',
  'csv.col.minutes',
  'csv.col.type',
  'csv.col.detail',
  'csv.col.note',
];

/** One CSV per baby (and one for pumping), for the pediatrician. Never counts as a backup. */
export async function prepareCsv(t: TranslateFn, locale: Locale, now = Date.now()): Promise<Prepared> {
  const snapshot = await readSnapshot(db, locale);
  const csv = buildCsvFiles({
    babies: snapshot.babies,
    events: snapshot.events,
    now,
    separator: csvSeparatorFor(locale),
    pumpLabel: t('sheet.pump.title'),
    fallbackLabel: t('csv.fallbackName'),
    text: {
      headers: CSV_HEADERS.map((key) => t(key)),
      typeLabel: (type) => typeLabel(t, type),
      describe: (event) => describeEvent(t, locale, event, now),
    },
  });
  const files = csv.map((file) => new File([file.text], file.name, { type: 'text/csv' }));
  const summary =
    files.length === 0
      ? t('csv.empty')
      : t('csv.contents', { n: formatNumber(locale, files.length), names: csv.map((file) => file.name).join(', ') });
  return { files, summary, countsAsBackup: countsAsBackup('csv') };
}
