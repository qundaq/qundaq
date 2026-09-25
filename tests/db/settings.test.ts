import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { loadSettings, saveSettings } from '../../src/db/settings';

const opened: TrackerDb[] = [];
function freshDb(name = `test-${crypto.randomUUID()}`): TrackerDb {
  const db = openDb(name);
  opened.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe('settings repository', () => {
  it('returns defaults with the fallback locale when nothing is stored', async () => {
    expect(await loadSettings(freshDb(), 'en')).toEqual({ locale: 'en', nightMode: false });
  });

  it('saves a patch and returns the merged settings', async () => {
    const db = freshDb();
    expect(await saveSettings(db, { nightMode: true }, 'tr')).toEqual({ locale: 'tr', nightMode: true });
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'tr', nightMode: true });
  });

  it('keeps untouched fields when patching', async () => {
    const db = freshDb();
    await saveSettings(db, { locale: 'en' }, 'tr');
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'en', nightMode: true });
  });

  it('survives closing and reopening the database', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = openDb(name);
    await saveSettings(first, { locale: 'en', nightMode: true }, 'tr');
    first.close();
    expect(await loadSettings(freshDb(name), 'tr')).toEqual({ locale: 'en', nightMode: true });
  });

  it('falls back to the default locale when the stored one is unknown', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'de', nightMode: true } as never);
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'en', nightMode: true });
  });

  it('falls back to the default night mode when the stored value is not a boolean', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: 'yes' } as never);
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'tr', nightMode: false });
  });

  it('keeps stored fields it does not know about when saving a patch', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: false, extra: 1 } as never);
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await db.settings.get('app')).toEqual({ id: 'app', locale: 'tr', nightMode: true, extra: 1 });
  });
});
