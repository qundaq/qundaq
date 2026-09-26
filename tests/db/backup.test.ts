import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBackup, serializeBackup } from '../../src/backup/export';
import { planImport, planSignature, type ImportOptions } from '../../src/backup/merge';
import { parseBackup, type ParsedBackup } from '../../src/backup/validate';
import { addBaby, deleteBaby } from '../../src/db/babies';
import { applyImport, readSnapshot } from '../../src/db/backup';
import { openDb, type TrackerDb } from '../../src/db/db';
import { listRunningEvents, logEvents } from '../../src/db/events';
import { loadSettings, saveSettings } from '../../src/db/settings';
import { DAY, MINUTE } from '../../src/domain/time';
import type { Baby, TrackerEvent } from '../../src/domain/types';

const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

const T = 1_790_000_000_000;

describe('readSnapshot', () => {
  it('reads every baby and event, deleted ones and their entries included, without the open marker', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, T);
    const can = await addBaby(db, { name: 'Can', color: '#ff9ecb' }, T);
    await logEvents(db, [{ type: 'sleep', babyId: ada.id, startAt: T }], T);
    await logEvents(db, [{ type: 'diaper', babyId: can.id, startAt: T, wet: true, dirty: false }], T);
    await deleteBaby(db, can.id, T + 1);
    await saveSettings(db, { nightMode: true, lastBackupAt: T }, 'tr');

    const snapshot = await readSnapshot(db, 'en');
    expect(snapshot.babies.map((baby) => baby.name).sort()).toEqual(['Ada', 'Can']);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.events.some((event) => 'open' in event)).toBe(false);
    expect(snapshot.settings).toMatchObject({ locale: 'tr', nightMode: true, lastBackupAt: T });
  });

  it('keeps a malformed row exactly as stored, so the backup carries it', async () => {
    const db = freshDb();
    const bad = { id: 'bad', type: 'breastfeed', babyId: 'b', startAt: T, endAt: T, segments: [], createdAt: T, updatedAt: T };
    await db.events.put(bad as never);
    const snapshot = await readSnapshot(db, 'tr');
    expect(snapshot.events).toEqual([bad]);
    expect(buildBackup(snapshot, { exportedAt: T, appVersion: '0.1.0' }).events).toEqual([bad]);
  });

  it('keeps a baby whose createdAt is missing, although the createdAt index leaves it out', async () => {
    const db = freshDb();
    await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, T);
    await db.babies.put({ id: 'no-created', name: 'X' } as never);
    const snapshot = await readSnapshot(db, 'tr');
    expect(snapshot.babies.map((baby) => baby.id)).toContain('no-created');
    expect(buildBackup(snapshot, { exportedAt: T, appVersion: '0.1.0' }).babies.map((baby) => baby.id)).toContain('no-created');
  });
});

describe('export, then read back', () => {
  it('round-trips babies, events (without open) and settings exactly, notes with trailing spaces included', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff', birthDate: '2026-09-01' }, T);
    const can = await addBaby(db, { name: 'Can', color: '#ff9ecb' }, T);
    await logEvents(db, [{ type: 'breastfeed', babyId: ada.id, startAt: T, segments: [{ side: 'L', start: T }] }], T);
    await logEvents(
      db,
      [
        { type: 'diaper', babyId: ada.id, startAt: T - MINUTE, wet: true, dirty: true, stoolColor: 'green', note: 'yeşil ' },
        { type: 'diaper', babyId: can.id, startAt: T - MINUTE, wet: true, dirty: false },
      ],
      T,
    );
    await logEvents(db, [{ type: 'pump', babyId: null, startAt: T - 2 * MINUTE, mlLeft: 60 }], T);
    await deleteBaby(db, can.id, T + 1);
    await saveSettings(db, { locale: 'en', nightMode: true, lastBabyIds: [ada.id], lastBackupAt: T }, 'tr');

    const snapshot = await readSnapshot(db, 'tr');
    const text = serializeBackup(buildBackup(snapshot, { exportedAt: T + 2, appVersion: '0.1.0' }));
    const result = parseBackup(text, T + DAY);
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual({ outOfRange: 0, settings: false, badBirthDate: 0 });
    expect(result.backup.babies).toEqual(snapshot.babies);
    expect(result.backup.events).toEqual(snapshot.events);
    expect(result.backup.settings).toEqual({ locale: 'en', nightMode: true, lastBabyIds: [ada.id] });
  });

  it("restores the app's own emergency backup: only the malformed row is skipped", async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, T);
    await logEvents(db, [{ type: 'diaper', babyId: ada.id, startAt: T, wet: true, dirty: false }], T);
    const row = (id: string, startAt: number) => ({ id, type: 'sleep', babyId: ada.id, startAt, endAt: startAt + 1, createdAt: T, updatedAt: T });
    await db.events.bulkPut([
      { ...row('bad', T), type: 'breastfeed', segments: [] } as never,
      row('from-1999', new Date(1999, 5, 1).getTime()) as never,
      row('ahead', T + 3 * DAY) as never,
    ]);

    const text = serializeBackup(buildBackup(await readSnapshot(db, 'tr'), { exportedAt: T, appVersion: '0.1.0' }));
    const result = parseBackup(text, T);
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped.map((skip) => [skip.code, skip.type])).toEqual([['bad-payload', 'breastfeed']]);
    expect(result.backup.events).toHaveLength(3);
    expect(result.backup.events.map((event) => event.id)).toEqual(expect.arrayContaining(['from-1999', 'ahead']));
    expect(result.warnings.outOfRange).toBe(2);
  });

  it('drops an unparseable stored birth date on import, keeping the baby and its events', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, T);
    // Nothing in the UI stops a malformed date reaching storage (some browsers' date input allows a
    // 6-digit year); write one straight to the table, as a real device's data could already hold.
    await db.babies.update(ada.id, { birthDate: '20266-01-01' });
    await logEvents(db, [{ type: 'diaper', babyId: ada.id, startAt: T, wet: true, dirty: false }], T);

    const text = serializeBackup(buildBackup(await readSnapshot(db, 'tr'), { exportedAt: T, appVersion: '0.1.0' }));
    const result = parseBackup(text, T);
    if (!result.ok) throw new Error(result.error);
    expect(result.skipped).toEqual([]);
    expect(result.backup.babies).toHaveLength(1);
    expect(result.backup.babies[0]).not.toHaveProperty('birthDate');
    expect(result.backup.events).toHaveLength(1);
    expect(result.warnings.badBirthDate).toBe(1);
  });
});

describe('applyImport', () => {
  const MERGE: ImportOptions = { mode: 'merge', sameBabies: [], stopStale: false };
  const REPLACE: ImportOptions = { ...MERGE, mode: 'replace' };
  const baby = (id: string, name: string): Baby => ({ id, name, color: '#7cb7ff', archived: false, createdAt: T, updatedAt: T });
  const sleep = (id: string, babyId: string, startAt: number, extra: Partial<TrackerEvent> = {}) =>
    ({ id, type: 'sleep', babyId, startAt, createdAt: startAt, updatedAt: startAt, ...extra }) as TrackerEvent;
  const file = (parts: Partial<ParsedBackup> = {}): ParsedBackup => ({
    schemaVersion: 1,
    exportedAt: T + 1,
    appVersion: '0.1.0',
    babies: [baby('b-file', 'Bora')],
    events: [sleep('file-running', 'b-file', T), sleep('file-done', 'b-file', T - DAY, { endAt: T - DAY + 1 })],
    settings: { locale: 'en', nightMode: true, lastBabyIds: ['b-file'] },
    ...parts,
  });

  /** The preview's signature, computed the way the import sheet does. */
  async function preview(db: TrackerDb, backup: ParsedBackup, options: ImportOptions, now = T + 2) {
    return planSignature(planImport(await readSnapshot(db, 'tr'), backup, options, now));
  }

  async function seedDevice(db: TrackerDb) {
    const ada = await addBaby(db, { name: 'Ada', color: '#ff9ecb' }, T);
    await logEvents(db, [{ type: 'sleep', babyId: ada.id, startAt: T }], T);
    await saveSettings(db, { lastBabyIds: [ada.id], lastBackupAt: T - DAY }, 'tr');
    return ada;
  }

  it('merge: adds the rows, keeps the running index right and keeps the device settings', async () => {
    const db = freshDb();
    const ada = await seedDevice(db);
    const backup = file();
    const result = await applyImport(db, { backup, options: MERGE, expected: await preview(db, backup, MERGE), fallbackLocale: 'tr', now: T + 2 });
    expect(result.applied).toBe(true);
    expect((await db.babies.toArray()).map((row) => row.name).sort()).toEqual(['Ada', 'Bora']);
    expect(await db.events.count()).toBe(3);
    expect((await listRunningEvents(db)).map((row) => row.babyId).sort()).toEqual([ada.id, 'b-file'].sort());
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: [ada.id], lastBackupAt: T - DAY });
  });

  it("replace: clears the device first, takes the file's language and night mode, keeps lastBackupAt", async () => {
    const db = freshDb();
    await seedDevice(db);
    const backup = file();
    const result = await applyImport(db, { backup, options: REPLACE, expected: await preview(db, backup, REPLACE), fallbackLocale: 'tr', now: T + 2 });
    expect(result.applied).toBe(true);
    expect((await db.babies.toArray()).map((row) => row.id)).toEqual(['b-file']);
    expect((await db.events.toArray()).map((row) => row.id).sort()).toEqual(['file-done', 'file-running']);
    expect((await listRunningEvents(db)).map((row) => row.id)).toEqual(['file-running']);
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'en', nightMode: true, lastBabyIds: ['b-file'], lastBackupAt: T - DAY });
  });

  it('writes the repaired timers: a stopped collision leaves the running index', async () => {
    const db = freshDb();
    await db.babies.put(baby('b-file', 'Bora'));
    await logEvents(db, [{ type: 'sleep', babyId: 'b-file', startAt: T + 1 }], T + 1);
    const backup = file();
    const result = await applyImport(db, { backup, options: MERGE, expected: await preview(db, backup, MERGE), fallbackLocale: 'tr', now: T + 2 });
    expect(result.plan.stopped.map((timer) => timer.id)).toEqual(['file-running']);
    const running = await listRunningEvents(db);
    expect(running).toHaveLength(1);
    expect(running[0]!.id).not.toBe('file-running');
    expect(await db.events.get('file-running')).toMatchObject({ endAt: T + 1 });
  });

  it('writes nothing and returns the new preview when the data changed since the preview', async () => {
    const db = freshDb();
    const ada = await seedDevice(db);
    const backup = file();
    const expected = await preview(db, backup, MERGE);
    await logEvents(db, [{ type: 'diaper', babyId: ada.id, startAt: T, wet: true, dirty: false }], T); // e.g. a second tab
    const result = await applyImport(db, { backup, options: MERGE, expected, fallbackLocale: 'tr', now: T + 2 });
    expect(result.applied).toBe(false);
    expect(result.plan.stats.localEvents).toBe(2);
    expect(await db.babies.count()).toBe(1);
    expect(await db.events.count()).toBe(2);
  });

  it('a failure half way leaves the database exactly as it was', async () => {
    const db = freshDb();
    await seedDevice(db);
    const before = await readSnapshot(db, 'tr');
    const backup = file();
    const expected = await preview(db, backup, REPLACE);
    const failing = vi.spyOn(db.events, 'bulkPut').mockRejectedValueOnce(new Error('disk full'));
    await expect(applyImport(db, { backup, options: REPLACE, expected, fallbackLocale: 'tr', now: T + 2 })).rejects.toThrow('disk full');
    failing.mockRestore();
    expect(await readSnapshot(db, 'tr')).toEqual(before);
    expect(await listRunningEvents(db)).toHaveLength(1);
  });
});
