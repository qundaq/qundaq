import Dexie, { type EntityTable } from 'dexie';
import type { Baby, TrackerEvent } from '../domain/types';
import { openFlagMiddleware, shouldBeOpen } from './openFlag';
import type { Settings } from './settings';

export type SettingsRow = Settings & { id: string };

/**
 * A stored event. `open: 1` is a storage-only marker on running, non-deleted rows, maintained by
 * openFlagMiddleware. Rows read back may carry it; it is not part of TrackerEvent, and exports drop it.
 */
export type EventRow = TrackerEvent & { open?: 1 };

// Declared as an intersection type instead of a subclass: with ES2022 class fields,
// a subclass field declaration would overwrite the table Dexie assigns in super().
export type TrackerDb = Dexie & {
  settings: EntityTable<SettingsRow, 'id'>;
  babies: EntityTable<Baby, 'id'>;
  events: EntityTable<EventRow, 'id'>;
};

export function openDb(name = 'qundaq'): TrackerDb {
  const db = new Dexie(name) as TrackerDb;
  db.version(1).stores({ settings: 'id' });
  // v2 adds tracking. Never edit a published version's schema; add a new version instead.
  db.version(2).stores({
    settings: 'id',
    babies: 'id, createdAt',
    events: 'id, babyId, type, startAt, [babyId+startAt], updatedAt',
  });
  // v3 adds a sparse index of running timers: only rows carrying `open` are in it.
  db.version(3)
    .stores({
      settings: 'id',
      babies: 'id, createdAt',
      events: 'id, babyId, type, startAt, [babyId+startAt], updatedAt, open',
    })
    .upgrade((tx) =>
      tx
        .table<EventRow, string>('events')
        .toCollection()
        .modify((row) => {
          if (shouldBeOpen(row)) row.open = 1;
          else delete row.open;
        }),
    );
  db.use(openFlagMiddleware);
  return db;
}
