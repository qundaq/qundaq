import type { Baby, Id, TrackerEvent } from '../domain/types';
import type { Locale } from '../i18n';

export const BACKUP_APP = 'qundaq';
/**
 * The backup file format version (the parent spec's `schemaVersion`). Every new stored field needs a bump
 * here plus a step in migrate.ts, so an older backup still reads; tests/backup/validate.test.ts fails when
 * a stored field is missing from the validator.
 */
export const BACKUP_VERSION = 1;
export const BACKUP_MIME = 'application/json';

/** The settings a backup carries. `lastBackupAt` and the reminder snooze describe this device and stay behind. */
export interface BackupSettings {
  locale: Locale;
  nightMode: boolean;
  lastBabyIds: Id[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  babies: Baby[];
  events: TrackerEvent[];
  mixes: []; // reserved for saved sound mixes (Plan 5)
  settings: BackupSettings;
}

/** Key order of a written baby row. Keys a row has beyond these follow in their stored order. */
export const BABY_KEYS = ['id', 'name', 'color', 'birthDate', 'archived', 'createdAt', 'updatedAt', 'deletedAt'] as const;

/** Key order of a written event row: identity, timing, every type's payload, then bookkeeping. */
export const EVENT_KEYS = [
  'id',
  'type',
  'babyId',
  'groupId',
  'startAt',
  'endAt',
  'segments',
  'ml',
  'contents',
  'wet',
  'dirty',
  'stoolColor',
  'consistency',
  'mlLeft',
  'mlRight',
  'weightG',
  'heightMm',
  'headMm',
  'celsius',
  'name',
  'dose',
  'note',
  'createdAt',
  'updatedAt',
  'deletedAt',
] as const;

// Every stored field has a place in the key order: a field added to Baby or to any TrackerEvent variant
// fails to compile here until it is listed (and then tests/backup/validate.test.ts until it is read back).
type KeysOf<T> = T extends unknown ? keyof T : never;
type UnorderedEventKeys = Exclude<KeysOf<TrackerEvent>, (typeof EVENT_KEYS)[number]>;
type UnorderedBabyKeys = Exclude<keyof Baby, (typeof BABY_KEYS)[number]>;
export const EVERY_EVENT_KEY_ORDERED: [UnorderedEventKeys] extends [never] ? true : UnorderedEventKeys = true;
export const EVERY_BABY_KEY_ORDERED: [UnorderedBabyKeys] extends [never] ? true : UnorderedBabyKeys = true;

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of `ms` in local time. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:mm` of `ms` in local time. */
export function localTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `qundaq-backup-2026-09-26-0740.json`, in local time. */
export function backupFileName(ms: number): string {
  return `qundaq-backup-${localDate(ms)}-${localTime(ms).replace(':', '')}.json`;
}
