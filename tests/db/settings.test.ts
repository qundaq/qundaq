import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { loadSettings, saveSettings } from '../../src/db/settings';
import type { LastSound } from '../../src/domain/sounds';

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
    expect(await loadSettings(freshDb(), 'en')).toEqual({
      locale: 'en',
      nightMode: false,
      theme: 'dark',
    });
  });

  it('saves a patch and returns the merged settings', async () => {
    const db = freshDb();
    expect(await saveSettings(db, { nightMode: true }, 'tr')).toEqual({
      locale: 'tr',
      nightMode: true,
      theme: 'dark',
    });
    expect(await loadSettings(db, 'en')).toEqual({
      locale: 'tr',
      nightMode: true,
      theme: 'dark',
    });
  });

  it('keeps untouched fields when patching', async () => {
    const db = freshDb();
    await saveSettings(db, { locale: 'en' }, 'tr');
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({
      locale: 'en',
      nightMode: true,
      theme: 'dark',
    });
  });

  it('survives closing and reopening the database', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = openDb(name);
    await saveSettings(first, { locale: 'en', nightMode: true }, 'tr');
    first.close();
    expect(await loadSettings(freshDb(name), 'tr')).toEqual({
      locale: 'en',
      nightMode: true,
      theme: 'dark',
    });
  });

  it('falls back to the default locale when the stored one is unknown', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'de', nightMode: true } as never);
    expect(await loadSettings(db, 'en')).toEqual({
      locale: 'en',
      nightMode: true,
      theme: 'dark',
    });
  });

  it('falls back to the default night mode when the stored value is not a boolean', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: 'yes' } as never);
    expect(await loadSettings(db, 'en')).toEqual({
      locale: 'tr',
      nightMode: false,
      theme: 'dark',
    });
  });

  it('keeps stored fields it does not know about when saving a patch', async () => {
    const db = freshDb();
    await db.settings.put({ id: 'app', locale: 'tr', nightMode: false, extra: 1 } as never);
    await saveSettings(db, { nightMode: true }, 'tr');
    expect(await db.settings.get('app')).toEqual({
      id: 'app',
      locale: 'tr',
      nightMode: true,
      theme: 'dark',
      extra: 1,
    });
  });

  it('validates the theme and defaults it to dark', async () => {
    const db = freshDb();
    await db.settings.put({
      id: 'app',
      locale: 'tr',
      nightMode: false,
      theme: 'purple',
    } as never);
    expect((await loadSettings(db, 'tr')).theme).toBe('dark');
    await saveSettings(db, { theme: 'light' }, 'tr');
    expect((await loadSettings(db, 'tr')).theme).toBe('light');
  });
});

describe('backup times in the settings row', () => {
  it('keeps finite backup times and drops anything else', async () => {
    const db = freshDb();
    await saveSettings(db, { lastBackupAt: 1000, backupReminderSnoozedUntil: 2000 }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({
      locale: 'tr',
      nightMode: false,
      theme: 'dark',
      lastBackupAt: 1000,
      backupReminderSnoozedUntil: 2000,
    });
    await db.settings.put({
      id: 'app',
      locale: 'tr',
      nightMode: false,
      lastBackupAt: 'yesterday',
      backupReminderSnoozedUntil: Number.NaN,
    } as never);
    expect(await loadSettings(db, 'tr')).toEqual({
      locale: 'tr',
      nightMode: false,
      theme: 'dark',
    });
  });
});

describe('sound settings in the settings row', () => {
  it('keeps a cap within 0.2–1 and drops one outside it, so the default applies', async () => {
    const db = freshDb();
    await saveSettings(db, { volumeCap: 0.8 }, 'tr');
    expect(await loadSettings(db, 'tr')).toEqual({
      locale: 'tr',
      nightMode: false,
      theme: 'dark',
      volumeCap: 0.8,
    });
    for (const bad of [5, 0.1, Number.NaN, '0.5', null]) {
      await db.settings.put({
        id: 'app',
        locale: 'tr',
        nightMode: false,
        volumeCap: bad,
      } as never);
      expect(await loadSettings(db, 'tr'), String(bad)).toEqual({
        locale: 'tr',
        nightMode: false,
        theme: 'dark',
      });
    }
  });

  it('keeps a well-formed last selection and drops a malformed one whole', async () => {
    const db = freshDb();
    const lastSound: LastSound = { soundId: 'white', master: 0.6, timerMin: null };
    await saveSettings(db, { lastSound }, 'tr');
    expect((await loadSettings(db, 'tr')).lastSound).toEqual(lastSound);
    const malformed = [
      { ...lastSound, master: Number.NaN },
      { ...lastSound, timerMin: 45 },
      'white',
    ];
    for (const bad of malformed) {
      await db.settings.put({
        id: 'app',
        locale: 'tr',
        nightMode: false,
        lastSound: bad,
      } as never);
      expect(await loadSettings(db, 'tr'), JSON.stringify(bad)).toEqual({
        locale: 'tr',
        nightMode: false,
        theme: 'dark',
      });
    }
  });

  it('loads a stored selection of an unknown sound as nothing selected, keeping the master and the chip', async () => {
    const db = freshDb();
    await db.settings.put({
      id: 'app',
      locale: 'tr',
      nightMode: false,
      lastSound: { soundId: 'pink', master: 0.4, timerMin: 15 },
    } as never);
    expect((await loadSettings(db, 'tr')).lastSound).toEqual({
      soundId: null,
      master: 0.4,
      timerMin: 15,
    });
  });
});
