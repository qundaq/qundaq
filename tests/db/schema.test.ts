import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/db';
import { loadSettings } from '../../src/db/settings';

describe('schema v2', () => {
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
    expect(db.verno).toBe(2);
    await db.delete();
  });
});
