import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/db';
import { loadSettings } from '../../src/db/settings';

const V2_STORES = {
  settings: 'id',
  babies: 'id, createdAt',
  events: 'id, babyId, type, startAt, [babyId+startAt], updatedAt',
};

describe('schema', () => {
  it('upgrades a version-1 database without losing settings', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ settings: 'id' });
    await v1.open();
    await v1.table('settings').put({ id: 'app', locale: 'en', nightMode: true });
    v1.close();

    const db = openDb(name);
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'en', nightMode: true, lastBabyIds: [] });
    expect(await db.babies.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(db.verno).toBe(3);
    await db.delete();
  });

  it('v3 flags the running, non-deleted events of a version-2 database', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ settings: 'id' });
    v2.version(2).stores(V2_STORES);
    await v2.open();
    const base = { babyId: 'a', createdAt: 1, updatedAt: 1 };
    await v2.table('events').bulkAdd([
      { ...base, id: 'running-sleep', type: 'sleep', startAt: 100 },
      { ...base, id: 'running-feed', type: 'breastfeed', startAt: 100, segments: [{ side: 'L', start: 100 }] },
      { ...base, id: 'finished', type: 'sleep', startAt: 100, endAt: 200 },
      { ...base, id: 'deleted-running', type: 'sleep', startAt: 100, deletedAt: 150 },
      { ...base, id: 'diaper', type: 'diaper', startAt: 100, wet: true, dirty: false },
    ]);
    v2.close();

    const db = openDb(name);
    expect((await db.events.where('open').equals(1).primaryKeys()).sort()).toEqual(['running-feed', 'running-sleep']);
    expect(await db.events.get('finished')).not.toHaveProperty('open');
    expect(await db.events.get('deleted-running')).not.toHaveProperty('open');
    expect(await db.events.count()).toBe(5);
    expect(db.verno).toBe(3);
    await db.delete();
  });
});
