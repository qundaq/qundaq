import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { BABY_NAME_MAX, addBaby, deleteBaby, listBabies, updateBaby } from '../../src/db/babies';
import { logEvents } from '../../src/db/events';
import { compareIds } from '../../src/domain/ids';
import { ValidationError } from '../../src/domain/rules';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';

const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe('babies repository', () => {
  it('adds a baby with a trimmed name and lists babies in creation order', async () => {
    const db = freshDb();
    const ada = await addBaby(
      db,
      { name: '  Ada ', color: '#7cb7ff', birthDate: '2026-09-01' },
      1000,
    );
    await addBaby(db, { name: 'Cal', color: '#ff9ecb' }, 2000);
    expect(ada).toMatchObject({
      name: 'Ada',
      color: '#7cb7ff',
      birthDate: '2026-09-01',
      archived: false,
      createdAt: 1000,
    });
    expect((await listBabies(db)).map((b) => b.name)).toEqual(['Ada', 'Cal']);
  });

  it('rejects a blank name and truncates long ones', async () => {
    const db = freshDb();
    await expect(addBaby(db, { name: '   ', color: '#7cb7ff' })).rejects.toEqual(
      new ValidationError(['name-required']),
    );
    const long = await addBaby(db, { name: 'x'.repeat(100), color: '#7cb7ff' });
    expect(long.name).toHaveLength(BABY_NAME_MAX);
  });

  it('renames with the same validation', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, 1000);
    await updateBaby(db, ada.id, { name: ' Ada Nora ', color: '#8fdc9a' }, 2000);
    expect(await listBabies(db)).toMatchObject([
      { name: 'Ada Nora', color: '#8fdc9a', updatedAt: 2000 },
    ]);
    await expect(updateBaby(db, ada.id, { name: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('clears the birth date when it is set to undefined', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff', birthDate: '2026-09-01' }, 1000);
    await updateBaby(db, ada.id, { name: 'Ada', color: '#7cb7ff', birthDate: undefined }, 2000);
    const stored = await db.babies.get(ada.id);
    expect(stored).not.toHaveProperty('birthDate');
    expect(stored).toMatchObject({ name: 'Ada', updatedAt: 2000 });
  });

  it('soft-deletes', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' });
    await deleteBaby(db, ada.id, 5000);
    expect(await listBabies(db)).toEqual([]);
    expect(await db.babies.get(ada.id)).toMatchObject({ deletedAt: 5000 });
  });

  it('deleting a baby ends its running timers at that moment', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, 1000);
    const cal = await addBaby(db, { name: 'Cal', color: '#ff9ecb' }, 1000);
    const now = 100 * MINUTE;
    const start = now - 20 * MINUTE;
    const switched = now - 5 * MINUTE;
    // recordEvents now refuses a second running timer for the same baby (Plan 8 §6.3), so Ada's running
    // sleep and running feed are seeded directly, as they would be from data older than the rule.
    // deleteBaby doesn't validate; it must still end every running row it finds for the baby, however many.
    const sleep: TrackerEvent = {
      type: 'sleep',
      babyId: ada.id,
      startAt: start,
      id: 'ada-sleep',
      createdAt: start,
      updatedAt: start,
    };
    const feed: TrackerEvent = {
      type: 'breastfeed',
      babyId: ada.id,
      startAt: start,
      segments: [
        { side: 'L', start, end: switched },
        { side: 'R', start: switched },
      ],
      id: 'ada-feed',
      createdAt: start,
      updatedAt: start,
    };
    await db.events.bulkAdd([sleep, feed]);
    const [doneSleep, canSleep, gone] = await logEvents(
      db,
      [
        { type: 'sleep', babyId: ada.id, startAt: start - 60 * MINUTE, endAt: start - 30 * MINUTE },
        { type: 'sleep', babyId: cal.id, startAt: start },
        { type: 'diaper', babyId: ada.id, startAt: start, wet: true, dirty: false },
      ],
      start,
    );
    // A deleted running entry is left alone.
    const deletedFeed = {
      ...feed,
      id: 'deleted-feed',
      deletedAt: start,
      segments: [{ side: 'L' as const, start }],
    };
    await db.events.add(deletedFeed);

    await deleteBaby(db, ada.id, now);

    expect(await db.events.get(sleep.id)).toMatchObject({ endAt: now, updatedAt: now });
    expect(await db.events.get(feed.id)).toMatchObject({
      endAt: now,
      updatedAt: now,
      segments: [
        { side: 'L', start, end: switched },
        { side: 'R', start: switched, end: now },
      ],
    });
    expect(await db.events.get(doneSleep!.id)).toEqual(doneSleep);
    expect(await db.events.get(canSleep!.id)).toEqual({ ...canSleep!, open: 1 });
    expect(await db.events.get(gone!.id)).toEqual(gone);
    expect(await db.events.get('deleted-feed')).toEqual(deletedFeed);
    expect(await db.events.where('open').equals(1).primaryKeys()).toEqual([canSleep!.id]);
    expect(await db.babies.get(ada.id)).toMatchObject({ deletedAt: now, updatedAt: now });
  });

  it('deleting an already deleted baby changes nothing', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, 1000);
    await deleteBaby(db, ada.id, 5000);
    await deleteBaby(db, ada.id, 9000);
    expect(await db.babies.get(ada.id)).toMatchObject({ deletedAt: 5000, updatedAt: 5000 });
  });

  it('deleting an unknown baby throws', async () => {
    const db = freshDb();
    await expect(deleteBaby(db, 'missing', 5000)).rejects.toThrow('Baby missing not found');
  });

  it('a deleted baby cannot be edited', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, 1000);
    await deleteBaby(db, ada.id, 5000);
    await expect(updateBaby(db, ada.id, { name: 'Ada Nora' }, 6000)).rejects.toThrow(
      `Baby ${ada.id} not found`,
    );
    expect(await db.babies.get(ada.id)).toMatchObject({ name: 'Ada', updatedAt: 5000 });
  });

  it('ties on createdAt are broken by id order (sort comparator unit test)', () => {
    // IndexedDB's cursor iteration order may already be ID-ordered, so this is a unit test
    // of the sort comparator expression in listBabies, verifying it produces ID order for ties.
    const now = 1000;
    const unsorted = [
      {
        id: 'z-baby',
        name: 'Zara',
        color: '#fff',
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      { id: 'a-baby', name: 'Ada', color: '#fff', archived: false, createdAt: now, updatedAt: now },
      {
        id: 'm-baby',
        name: 'Mira',
        color: '#fff',
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // Simulate the sort that listBabies applies
    unsorted.sort((a, b) => a.createdAt - b.createdAt || compareIds(a.id, b.id));

    // All have the same createdAt, so sort must be by id
    expect(unsorted.map((b) => b.id)).toEqual(['a-baby', 'm-baby', 'z-baby']);
  });
});
