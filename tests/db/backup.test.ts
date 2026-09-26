import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { addBaby, deleteBaby } from '../../src/db/babies';
import { readSnapshot } from '../../src/db/backup';
import { openDb, type TrackerDb } from '../../src/db/db';
import { logEvents } from '../../src/db/events';
import { saveSettings } from '../../src/db/settings';
import { buildBackup } from '../../src/backup/export';

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
