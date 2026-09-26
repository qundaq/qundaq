import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { countsAsBackup, fileSize, lastBackupText } from '../../src/ui/backup/text';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

describe('fileSize', () => {
  it('shows kilobytes rounded up below a megabyte, megabytes with one decimal above', () => {
    expect(fileSize(tr, 'tr', 10)).toBe('1 KB');
    expect(fileSize(tr, 'tr', 180 * 1024)).toBe('180 KB');
    expect(fileSize(tr, 'tr', 180 * 1024 + 1)).toBe('181 KB');
    expect(fileSize(tr, 'tr', 4.25 * 1024 * 1024)).toBe('4,3 MB');
    expect(fileSize(en, 'en', 4.25 * 1024 * 1024)).toBe('4.3 MB');
  });
});

describe('lastBackupText', () => {
  it('says when the last backup was, or that there is none', () => {
    expect(lastBackupText(tr, 'tr', undefined, at(26, 9))).toBe('Henüz yedek alınmadı.');
    expect(lastBackupText(tr, 'tr', at(26, 7, 5), at(26, 9))).toBe('Son yedek: bugün (26 Eyl 07:05)');
    expect(lastBackupText(tr, 'tr', at(25, 22), at(26, 9))).toBe('Son yedek: dün (25 Eyl 22:00)');
    expect(lastBackupText(tr, 'tr', at(23, 21, 40), at(26, 9))).toBe('Son yedek: 3 gün önce (23 Eyl 21:40)');
    expect(lastBackupText(en, 'en', at(23, 21, 40), at(26, 9))).toBe('Last backup: 3 days ago (Sep 23 21:40)');
  });

  it('treats a backup time more than a day ahead as no backup, as Home does', () => {
    expect(lastBackupText(tr, 'tr', at(26, 20), at(26, 9))).toBe('Son yedek: bugün (26 Eyl 20:00)');
    expect(lastBackupText(tr, 'tr', at(28, 9), at(26, 9))).toBe('Henüz yedek alınmadı.');
  });
});

describe('countsAsBackup', () => {
  it('is true for the JSON backup, false for the CSV export', () => {
    expect(countsAsBackup('json')).toBe(true);
    expect(countsAsBackup('csv')).toBe(false);
  });
});
