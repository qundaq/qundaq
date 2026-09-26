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
    expect(await loadSettings(freshDb(), 'en')).toEqual({ locale: 'en', nightMode: false, lastBabyIds: [] });
  });

  it('saves a patch and returns the merged settings', async () => {
    const db = freshDb();
    expect(await saveSettings(db, { nightMode: true }, 'tr')).toEqual({ locale: 'tr', nightMode: true, lastBabyIds: [] });
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'tr', nightMode: true, lastBabyIds: [] });
  });

  it('keeps untouched fields when patching', async () => {
    const db = freshDb();
    await saveSettings(db, { locale: 'en' }, 'tr');
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'en', nightMode: true, lastBabyIds: [] });
  });

  it('survives closing and reopening the database', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = openDb(name);
    await saveSettings(first, { locale: 'en', nightMode: true }, 'tr');
    first.close();
    expect(await loadSettings(freshDb(name), 'tr')).toEqual({ locale: 'en', nightMode: true, lastBabyIds: [] });
  });

  it('falls back to the default locale when the stored one is unknown', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'de', nightMode: true } as never);
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'en', nightMode: true, lastBabyIds: [] });
  });

  it('falls back to the default night mode when the stored value is not a boolean', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: 'yes' } as never);
    expect(await loadSettings(db, 'en')).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: [] });
  });

  it('keeps stored fields it does not know about when saving a patch', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: false, extra: 1 } as never);
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await db.settings.get('app')).toEqual({ id: 'app', locale: 'tr', nightMode: true, extra: 1, lastBabyIds: [] });
  });

  it('keeps a valid lastBabyIds list and drops an invalid one', async () => {
    const db = freshDb();
    await saveSettings(db, { lastBabyIds: ['a', 'b'] }, 'tr');
    expect((await loadSettings(db, 'tr')).lastBabyIds).toEqual(['a', 'b']);
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: false, lastBabyIds: 'a' } as never);
    expect((await loadSettings(db, 'tr')).lastBabyIds).toEqual([]);
  });
});

describe('backup times in the settings row', () => {
  it('keeps finite backup times and drops anything else', async () => {
    const db = freshDb();
    await saveSettings(db, { lastBackupAt: 1000, backupReminderSnoozedUntil: 2000 }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: [], lastBackupAt: 1000, backupReminderSnoozedUntil: 2000 });
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: false, lastBabyIds: [], lastBackupAt: 'yesterday', backupReminderSnoozedUntil: Number.NaN } as never);
    expect(await loadSettings(db, 'tr')).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: [] });
  });
});
