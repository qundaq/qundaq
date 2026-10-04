import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDb, type EventRow } from '../../src/db/db';

describe('schema', () => {
  it('opens at its single version with the settings, babies and events tables', async () => {
    const db = openDb(`test-${crypto.randomUUID()}`);
    await db.open();
    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['babies', 'events', 'settings']);
    await db.delete();
  });

  it('keeps only running, non-deleted events in the sparse open index', async () => {
    const db = openDb(`test-${crypto.randomUUID()}`);
    const base = { babyId: 'a', createdAt: 1, updatedAt: 1 };
    const rows: EventRow[] = [
      { ...base, id: 'running-sleep', type: 'sleep', startAt: 100 },
      {
        ...base,
        id: 'running-feed',
        type: 'breastfeed',
        startAt: 100,
        segments: [{ side: 'L', start: 100 }],
      },
      { ...base, id: 'finished', type: 'sleep', startAt: 100, endAt: 200 },
      { ...base, id: 'deleted-running', type: 'sleep', startAt: 100, deletedAt: 150 },
      { ...base, id: 'diaper', type: 'diaper', startAt: 100, wet: true, dirty: false },
    ];
    await db.events.bulkAdd(rows);
    expect((await db.events.where('open').equals(1).primaryKeys()).sort()).toEqual([
      'running-feed',
      'running-sleep',
    ]);
    expect(await db.events.get('finished')).not.toHaveProperty('open');
    expect(await db.events.get('deleted-running')).not.toHaveProperty('open');
    expect(await db.events.count()).toBe(5);
    await db.delete();
  });
});
