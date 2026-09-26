import type { Settings } from '../db/settings';
import type { Baby, Id, Mix, TrackerEvent } from '../domain/types';
import type { Locale } from '../i18n';

export const BACKUP_APP = 'qundaq';
/**
 * The backup file format version (the parent spec's `schemaVersion`). Every new stored field needs a bump
 * here plus a step in migrate.ts, so an older backup still reads; tests/backup/validate.test.ts fails when
 * a stored field is missing from the validator. Version 2 makes `mixes` real data (saved sound mixes).
 */
export const BACKUP_VERSION = 2;
export const BACKUP_MIME = 'application/json';

/** The settings a backup carries; the keys in DEVICE_ONLY_SETTINGS stay behind. */
export interface BackupSettings {
  locale: Locale;
  nightMode: boolean;
  lastBabyIds: Id[];
}

/**
 * Settings that describe this device and are never exported: when it last backed up, the reminder snooze,
 * the sound safety cap (a restore must never raise another phone's safety limit) and the last selection
 * on the Sesler tab. Every key of Settings is either here or in BackupSettings, checked below.
 */
export const DEVICE_ONLY_SETTINGS = ['lastBackupAt', 'backupReminderSnoozedUntil', 'volumeCap', 'lastSound'] as const;

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  babies: Baby[];
  events: TrackerEvent[];
  mixes: Mix[];
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

/** Key order of a written mix row. */
export const MIX_KEYS = ['id', 'name', 'layers', 'createdAt', 'updatedAt', 'deletedAt'] as const;

// Every stored field has a place in the key order: a field added to Baby, Mix or to any TrackerEvent
// variant fails to compile here until it is listed (and then tests/backup/validate.test.ts until it is
// read back). Likewise every settings key is either exported or listed as device-only.
type KeysOf<T> = T extends unknown ? keyof T : never;
type UnorderedEventKeys = Exclude<KeysOf<TrackerEvent>, (typeof EVENT_KEYS)[number]>;
type UnorderedBabyKeys = Exclude<keyof Baby, (typeof BABY_KEYS)[number]>;
type UnorderedMixKeys = Exclude<keyof Mix, (typeof MIX_KEYS)[number]>;
type ClassifiedSettingsKeys = keyof BackupSettings | (typeof DEVICE_ONLY_SETTINGS)[number];
type UnclassifiedSettingsKeys = Exclude<keyof Settings, ClassifiedSettingsKeys> | Exclude<ClassifiedSettingsKeys, keyof Settings>;
export const EVERY_EVENT_KEY_ORDERED: [UnorderedEventKeys] extends [never] ? true : UnorderedEventKeys = true;
export const EVERY_BABY_KEY_ORDERED: [UnorderedBabyKeys] extends [never] ? true : UnorderedBabyKeys = true;
export const EVERY_MIX_KEY_ORDERED: [UnorderedMixKeys] extends [never] ? true : UnorderedMixKeys = true;
export const EVERY_SETTINGS_KEY_CLASSIFIED: [UnclassifiedSettingsKeys] extends [never] ? true : UnclassifiedSettingsKeys = true;

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
