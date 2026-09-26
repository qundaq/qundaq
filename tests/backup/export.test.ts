import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, countLive, serializeBackup, type Snapshot } from '../../src/backup/export';
import { BACKUP_VERSION, DEVICE_ONLY_SETTINGS, backupFileName } from '../../src/backup/format';
import type { Settings } from '../../src/db/settings';

let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const T = 1_790_000_000_000;

function snapshot(): Snapshot {
  return {
    babies: [
      { updatedAt: T, name: 'Ada', id: 'b1', createdAt: T, archived: false, color: '#7cb7ff' },
      { id: 'b2', name: 'Can', color: '#ff9ecb', archived: false, createdAt: T, updatedAt: T + 5, deletedAt: T + 5 },
    ],
    events: [
      { id: 'e1', type: 'sleep', babyId: 'b1', startAt: T, createdAt: T, updatedAt: T, open: 1 },
      { note: 'kept ', updatedAt: T, createdAt: T, dirty: false, wet: true, startAt: T, babyId: 'b1', type: 'diaper', id: 'e2' },
      // A malformed row, as a bad write could leave it: copied as it is.
      { id: 'e3', type: 'breastfeed', babyId: 'b2', startAt: T, endAt: T, segments: 'broken', createdAt: T, updatedAt: T, extra: 7 },
    ],
    mixes: [
      { updatedAt: T, layers: [{ gain: 0.7, soundId: 'white' }], name: 'Gece', id: 'm1', createdAt: T },
      { id: 'm2', name: 'Eski', layers: [{ soundId: 'pink', gain: 0.5 }], createdAt: T, updatedAt: T + 1, deletedAt: T + 1 },
    ],
    settings: { locale: 'tr', nightMode: true, lastBabyIds: ['b1'] },
  };
}

describe('buildBackup', () => {
  it('writes the header, every row (tombstones included) and the settings', () => {
    const backup = buildBackup(snapshot(), { exportedAt: T + 10, appVersion: '0.1.0' });
    expect(backup.app).toBe('qundaq');
    expect(backup.schemaVersion).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe(T + 10);
    expect(backup.appVersion).toBe('0.1.0');
    expect(backup.babies.map((baby) => baby.id)).toEqual(['b1', 'b2']);
    expect(backup.babies[1]).toMatchObject({ deletedAt: T + 5 });
    expect(backup.events).toHaveLength(3);
    expect(backup.mixes).toHaveLength(2);
    expect(backup.mixes[1]).toMatchObject({ deletedAt: T + 1 });
    expect(backup.settings).toEqual({ locale: 'tr', nightMode: true, lastBabyIds: ['b1'] });
  });

  it('drops the storage-only open marker and nothing else', () => {
    const backup = buildBackup(snapshot(), { exportedAt: T, appVersion: '0.1.0' });
    expect(backup.events[0]).toEqual({ id: 'e1', type: 'sleep', babyId: 'b1', startAt: T, createdAt: T, updatedAt: T });
    expect(backup.events[1]).toMatchObject({ note: 'kept ' });
    expect(backup.events[2]).toEqual({
      id: 'e3',
      type: 'breastfeed',
      babyId: 'b2',
      startAt: T,
      endAt: T,
      segments: 'broken',
      createdAt: T,
      updatedAt: T,
      extra: 7,
    });
  });

  it('writes keys in a fixed order, unknown keys last', () => {
    const backup = buildBackup(snapshot(), { exportedAt: T, appVersion: '0.1.0' });
    expect(Object.keys(backup)).toEqual(['app', 'schemaVersion', 'exportedAt', 'appVersion', 'babies', 'events', 'mixes', 'settings']);
    expect(Object.keys(backup.babies[0]!)).toEqual(['id', 'name', 'color', 'archived', 'createdAt', 'updatedAt']);
    expect(Object.keys(backup.events[1]!)).toEqual(['id', 'type', 'babyId', 'startAt', 'wet', 'dirty', 'note', 'createdAt', 'updatedAt']);
    expect(Object.keys(backup.events[2]!).at(-1)).toBe('extra');
    expect(Object.keys(backup.mixes[0]!)).toEqual(['id', 'name', 'layers', 'createdAt', 'updatedAt']);
    expect(backup.mixes[0]!.layers).toEqual([{ gain: 0.7, soundId: 'white' }]);
  });

  it('never exports what describes this device only', () => {
    const deviceOnly: Pick<Required<Settings>, (typeof DEVICE_ONLY_SETTINGS)[number]> = {
      lastBackupAt: T,
      backupReminderSnoozedUntil: T,
      volumeCap: 1,
      lastSound: { layers: [{ soundId: 'white', level: 1 }], master: 1, timerMin: null },
    };
    expect(Object.keys(deviceOnly).sort()).toEqual([...DEVICE_ONLY_SETTINGS].sort());
    const settings = { locale: 'en' as const, nightMode: false, lastBabyIds: [], ...deviceOnly };
    const backup = buildBackup({ ...snapshot(), settings }, { exportedAt: T, appVersion: '0.1.0' });
    expect(backup.settings).toEqual({ locale: 'en', nightMode: false, lastBabyIds: [] });
    for (const key of DEVICE_ONLY_SETTINGS) expect(serializeBackup(backup)).not.toContain(key);
  });

  it('keeps a key named __proto__ as data', () => {
    const row = JSON.parse('{"id":"e9","type":"sleep","babyId":"b1","startAt":1,"createdAt":1,"updatedAt":1,"__proto__":{"x":1}}') as object;
    const backup = buildBackup({ ...snapshot(), events: [row] }, { exportedAt: T, appVersion: '0.1.0' });
    expect(Object.getPrototypeOf(backup.events[0])).toBe(Object.prototype);
    expect(serializeBackup(backup)).toContain('"__proto__":{"x":1}');
  });
});

describe('serializeBackup', () => {
  it('writes a BigInt as its digits instead of throwing', () => {
    const row = { id: 'e9', type: 'sleep', babyId: 'b1', startAt: 1, createdAt: 1, updatedAt: 1, extra: 12n };
    const backup = buildBackup({ ...snapshot(), events: [row] }, { exportedAt: T, appVersion: '0.1.0' });
    expect(serializeBackup(backup)).toContain('"extra":"12"');
  });

  it('writes compact JSON that parses back to the same object', () => {
    const backup = buildBackup(snapshot(), { exportedAt: T, appVersion: '0.1.0' });
    const text = serializeBackup(backup);
    expect(text).not.toContain('\n');
    expect(text.startsWith('{"app":"qundaq","schemaVersion":2,')).toBe(true);
    expect(JSON.parse(text)).toEqual(backup);
  });
});

describe('file name and counts', () => {
  it('names the file after the local date and time', () => {
    expect(backupFileName(new Date(2026, 8, 26, 7, 40).getTime())).toBe('qundaq-backup-2026-09-26-0740.json');
  });

  it('counts rows that are not deleted', () => {
    expect(countLive(snapshot().babies)).toBe(1);
    expect(countLive(snapshot().events)).toBe(3);
  });
});
