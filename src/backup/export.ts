import { BABY_KEYS, BACKUP_APP, BACKUP_VERSION, EVENT_KEYS, type BackupFile, type BackupSettings } from './format';

/** What the device holds. Event rows may carry the storage-only `open` marker; it never reaches a file. */
export interface Snapshot {
  babies: readonly object[];
  events: readonly object[];
  settings: BackupSettings;
}

export interface BackupMeta {
  exportedAt: number;
  appVersion: string;
}

/**
 * A copy of `row` with the keys of `order` first and every other own key after them, in stored order,
 * minus `drop`. Generic on purpose: a malformed row (a breastfeed whose `segments` is not an array, say)
 * is copied as it is, never rebuilt by type, so exporting can neither lose it nor throw on it.
 * Object.fromEntries defines keys as own data properties, so even a key named "__proto__" stays data.
 */
function orderedCopy(row: object, order: readonly string[], drop: readonly string[] = []): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const keys = [...order.filter((key) => Object.hasOwn(source, key))];
  for (const key of Object.keys(source)) if (!keys.includes(key) && !drop.includes(key)) keys.push(key);
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

/**
 * Every baby and every event, deleted and archived ones included (their tombstones keep a later merge
 * from bringing them back). Only the events' storage-only `open` field is left out.
 */
export function buildBackup(snapshot: Snapshot, meta: BackupMeta): BackupFile {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_VERSION,
    exportedAt: meta.exportedAt,
    appVersion: meta.appVersion,
    babies: snapshot.babies.map((baby) => orderedCopy(baby, BABY_KEYS)) as unknown as BackupFile['babies'],
    events: snapshot.events.map((event) => orderedCopy(event, EVENT_KEYS, ['open'])) as unknown as BackupFile['events'],
    mixes: [],
    settings: {
      locale: snapshot.settings.locale,
      nightMode: snapshot.settings.nightMode,
      lastBabyIds: [...snapshot.settings.lastBabyIds],
    },
  };
}

/** Compact JSON (a year of twins is a few MB). A BigInt, which IndexedDB can store but JSON cannot, becomes its digits. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
}

/** Rows that are not deleted, for "2 bebek · 1.234 kayıt". */
export function countLive(rows: readonly object[]): number {
  return rows.filter((row) => (row as { deletedAt?: unknown }).deletedAt === undefined).length;
}
