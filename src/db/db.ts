import Dexie, { type EntityTable } from 'dexie';
import type { Baby, TrackerEvent } from '../domain/types';
import type { Settings } from './settings';

export type SettingsRow = Settings & { id: string };

// Declared as an intersection type instead of a subclass: with ES2022 class fields,
// a subclass field declaration would overwrite the table Dexie assigns in super().
export type TrackerDb = Dexie & {
  settings: EntityTable<SettingsRow, 'id'>;
  babies: EntityTable<Baby, 'id'>;
  events: EntityTable<TrackerEvent, 'id'>;
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
  return db;
}
