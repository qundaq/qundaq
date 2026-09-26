import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { deleteMix, listMixes, renameMix, saveMix } from '../../src/db/mixes';
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

const LAYERS = [
  { soundId: 'white', gain: 0.7 },
  { soundId: 'rain', gain: 0.4 },
];

describe('mixes repository', () => {
  it('saves a mix with a trimmed name and lists live mixes oldest first', async () => {
    const db = freshDb();
    const night = await saveMix(db, '  Gece ', LAYERS, 2000);
    await saveMix(db, 'Öğlen', [{ soundId: 'pink', gain: 1 }], 1000);
    expect(night).toMatchObject({ name: 'Gece', layers: LAYERS, createdAt: 2000, updatedAt: 2000 });
    expect(night.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await listMixes(db)).map((mix) => mix.name)).toEqual(['Öğlen', 'Gece']);
  });

  it('allows two mixes with the same name', async () => {
    const db = freshDb();
    await saveMix(db, 'Gece', LAYERS, 1000);
    await saveMix(db, 'Gece', LAYERS, 2000);
    expect(await listMixes(db)).toHaveLength(2);
  });

  it('refuses a blank or too long name, and layers that are not 1–6 known unique sounds', async () => {
    const db = freshDb();
    await expect(saveMix(db, '  ', LAYERS)).rejects.toEqual(new ValidationError(['name-required']));
    await expect(saveMix(db, 'x'.repeat(41), LAYERS)).rejects.toEqual(
      new ValidationError(['text-too-long']),
    );
    await expect(saveMix(db, 'Gece', [])).rejects.toEqual(
      new ValidationError(['mix-layers-invalid']),
    );
    await expect(saveMix(db, 'Gece', [{ soundId: 'train', gain: 0.5 }])).rejects.toEqual(
      new ValidationError(['mix-layers-invalid']),
    );
    await expect(saveMix(db, 'Gece', [{ soundId: 'white', gain: 2 }])).rejects.toEqual(
      new ValidationError(['mix-layers-invalid']),
    );
    expect(await db.mixes.count()).toBe(0);
  });

  it('renames with the same name check', async () => {
    const db = freshDb();
    const mix = await saveMix(db, 'Gece', LAYERS, 1000);
    await renameMix(db, mix.id, ' Derin uyku ', 2000);
    expect(await db.mixes.get(mix.id)).toMatchObject({
      name: 'Derin uyku',
      updatedAt: 2000,
      layers: LAYERS,
    });
    await expect(renameMix(db, mix.id, '')).rejects.toBeInstanceOf(ValidationError);
    await expect(renameMix(db, 'missing', 'x')).rejects.toThrow('not found');
  });

  it('soft-deletes: the row stays as a tombstone, and deleting again keeps the first time', async () => {
    const db = freshDb();
    const mix = await saveMix(db, 'Gece', LAYERS, 1000);
    await deleteMix(db, mix.id, 2000);
    expect(await listMixes(db)).toEqual([]);
    expect(await db.mixes.get(mix.id)).toMatchObject({ deletedAt: 2000, updatedAt: 2000 });
    await deleteMix(db, mix.id, 3000);
    expect(await db.mixes.get(mix.id)).toMatchObject({ deletedAt: 2000 });
    await expect(renameMix(db, mix.id, 'x')).rejects.toThrow('not found');
  });

  it('lists a row whose createdAt is missing, as a backup could have written it', async () => {
    const db = freshDb();
    await db.mixes.put({ id: 'odd', name: 'Eski', layers: LAYERS, updatedAt: 1 } as never);
    await saveMix(db, 'Gece', LAYERS, 1000);
    expect((await listMixes(db)).map((mix) => mix.name)).toEqual(['Eski', 'Gece']);
  });
});
