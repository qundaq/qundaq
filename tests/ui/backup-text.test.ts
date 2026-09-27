import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { clockTime, shortDate } from '../../src/ui/history/describe';
import { countsAsBackup, fileSize, lastBackupText } from '../../src/ui/backup/text';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const stamp = (locale: 'tr' | 'en', ms: number) =>
  `${shortDate(locale, ms)} ${clockTime(locale, ms)}`;

describe('fileSize', () => {
  it('shows kilobytes rounded up below a megabyte, megabytes with one decimal above', () => {
    expect(fileSize(tr, 'tr', 10)).toBe(tr('unit.kb', { n: '1' }));
    expect(fileSize(tr, 'tr', 180 * 1024)).toBe(tr('unit.kb', { n: '180' }));
    expect(fileSize(tr, 'tr', 180 * 1024 + 1)).toBe(tr('unit.kb', { n: '181' }));
    expect(fileSize(tr, 'tr', 4.25 * 1024 * 1024)).toBe(tr('unit.mb', { n: '4,3' }));
    expect(fileSize(en, 'en', 4.25 * 1024 * 1024)).toBe(en('unit.mb', { n: '4.3' }));
  });
});

describe('lastBackupText', () => {
  it('says when the last backup was, or that there is none', () => {
    expect(lastBackupText(tr, 'tr', undefined, at(26, 9))).toBe(tr('backup.never'));
    expect(lastBackupText(tr, 'tr', at(26, 7, 5), at(26, 9))).toBe(
      tr('backup.last', { ago: tr('backup.today'), date: stamp('tr', at(26, 7, 5)) }),
    );
    expect(lastBackupText(tr, 'tr', at(25, 22), at(26, 9))).toBe(
      tr('backup.last', { ago: tr('backup.yesterday'), date: stamp('tr', at(25, 22)) }),
    );
    expect(lastBackupText(tr, 'tr', at(23, 21, 40), at(26, 9))).toBe(
      tr('backup.last', {
        ago: tr('backup.daysAgo', { n: 3 }),
        date: stamp('tr', at(23, 21, 40)),
      }),
    );
    expect(lastBackupText(en, 'en', at(23, 21, 40), at(26, 9))).toBe(
      en('backup.last', {
        ago: en('backup.daysAgo', { n: 3 }),
        date: stamp('en', at(23, 21, 40)),
      }),
    );
  });

  it('treats a backup time more than a day ahead as no backup, as Home does', () => {
    expect(lastBackupText(tr, 'tr', at(26, 20), at(26, 9))).toBe(
      tr('backup.last', { ago: tr('backup.today'), date: stamp('tr', at(26, 20)) }),
    );
    expect(lastBackupText(tr, 'tr', at(28, 9), at(26, 9))).toBe(tr('backup.never'));
  });
});

describe('countsAsBackup', () => {
  it('is true for the JSON backup, false for the CSV export', () => {
    expect(countsAsBackup('json')).toBe(true);
    expect(countsAsBackup('csv')).toBe(false);
  });
});
