import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { shouldBeOpen, withOpenFlag } from '../../src/db/openFlag';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();
const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

function sleep(id: string, extra: Partial<TrackerEvent> = {}): TrackerEvent {
  return {
    id,
    type: 'sleep',
    babyId: 'a',
    startAt: NOW - 30 * MINUTE,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  } as TrackerEvent;
}

async function openIds(db: TrackerDb): Promise<string[]> {
  return (await db.events.where('open').equals(1).primaryKeys()).sort();
}

describe('withOpenFlag', () => {
  it('flags exactly the running rows that are not deleted', () => {
    expect(withOpenFlag(sleep('s'))).toMatchObject({ open: 1 });
    expect(withOpenFlag(sleep('s', { endAt: NOW }))).not.toHaveProperty('open');
    expect(withOpenFlag(sleep('s', { deletedAt: NOW }))).not.toHaveProperty('open');
    expect(withOpenFlag({ ...sleep('s', { endAt: NOW }), open: 1 as const })).not.toHaveProperty(
      'open',
    );
    const diaper = {
      id: 'd',
      type: 'diaper',
      babyId: 'a',
      startAt: NOW,
      wet: true,
      dirty: false,
      createdAt: NOW,
      updatedAt: NOW,
    } as TrackerEvent;
    expect(shouldBeOpen(diaper)).toBe(false);
    expect(withOpenFlag(diaper)).not.toHaveProperty('open');
  });

  it('returns a copy and leaves its argument alone', () => {
    const row = sleep('s');
    const flagged = withOpenFlag(row);
    expect(flagged).not.toBe(row);
    expect(row).not.toHaveProperty('open');
  });
});

describe('open-flag middleware', () => {
  it('keeps the open index exact through add, put, update, bulkPut and modify', async () => {
    const db = freshDb();
    await db.events.add(sleep('added'));
    await db.events.put(sleep('put'));
    expect(await openIds(db)).toEqual(['added', 'put']);

    await db.events.update('put', { endAt: NOW });
    expect(await openIds(db)).toEqual(['added']);

    await db.events.bulkPut([sleep('bulk-open'), sleep('bulk-done', { endAt: NOW })]);
    expect(await openIds(db)).toEqual(['added', 'bulk-open']);

    await db.events.where('id').equals('bulk-open').modify({ deletedAt: NOW });
    expect(await openIds(db)).toEqual(['added']);

    await db.events
      .where('id')
      .equals('added')
      .modify((row) => {
        row.endAt = NOW;
      });
    expect(await openIds(db)).toEqual([]);
  });

  it('drops a stale flag that a caller wrote by hand', async () => {
    const db = freshDb();
    await db.events.put({ ...sleep('done', { endAt: NOW }), open: 1 });
    expect(await openIds(db)).toEqual([]);
    expect(await db.events.get('done')).not.toHaveProperty('open');
  });

  it('a running row read back carries the flag', async () => {
    const db = freshDb();
    await db.events.put(sleep('s'));
    expect(await db.events.get('s')).toEqual({ ...sleep('s'), open: 1 });
  });
});
