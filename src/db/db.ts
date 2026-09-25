import Dexie, { type EntityTable } from 'dexie';
import type { Settings } from './settings';

export type SettingsRow = Settings & { id: string };

// Declared as an intersection type instead of a subclass: with ES2022 class fields,
// a subclass field declaration would overwrite the table Dexie assigns in super().
export type TrackerDb = Dexie & {
  settings: EntityTable<SettingsRow, 'id'>;
};

export function openDb(name = 'qundaq'): TrackerDb {
  const db = new Dexie(name) as TrackerDb;
  db.version(1).stores({ settings: 'id' });
  return db;
}
