import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { BABY_NAME_MAX, addBaby, deleteBaby, listBabies, updateBaby } from '../../src/db/babies';
import { ValidationError } from '../../src/domain/rules';

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
    const ada = await addBaby(db, { name: '  Ada ', color: '#7cb7ff', birthDate: '2026-09-01' }, 1000);
    await addBaby(db, { name: 'Can', color: '#ff9ecb' }, 2000);
    expect(ada).toMatchObject({ name: 'Ada', color: '#7cb7ff', birthDate: '2026-09-01', archived: false, createdAt: 1000 });
    expect((await listBabies(db)).map((b) => b.name)).toEqual(['Ada', 'Can']);
  });

  it('rejects a blank name and truncates long ones', async () => {
    const db = freshDb();
    await expect(addBaby(db, { name: '   ', color: '#7cb7ff' })).rejects.toEqual(new ValidationError(['name-required']));
    const long = await addBaby(db, { name: 'x'.repeat(100), color: '#7cb7ff' });
    expect(long.name).toHaveLength(BABY_NAME_MAX);
  });

  it('renames with the same validation', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' }, 1000);
    await updateBaby(db, ada.id, { name: ' Ada Nur ', color: '#8fdc9a' }, 2000);
    expect(await listBabies(db)).toMatchObject([{ name: 'Ada Nur', color: '#8fdc9a', updatedAt: 2000 }]);
    await expect(updateBaby(db, ada.id, { name: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('soft-deletes', async () => {
    const db = freshDb();
    const ada = await addBaby(db, { name: 'Ada', color: '#7cb7ff' });
    await deleteBaby(db, ada.id, 5000);
    expect(await listBabies(db)).toEqual([]);
    expect(await db.babies.get(ada.id)).toMatchObject({ deletedAt: 5000 });
  });
});
