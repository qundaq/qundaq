import { BACKUP_VERSION } from './format';

/** A backup file after JSON.parse, before validation. */
export type RawBackup = Record<string, unknown>;

/** Turns a version-n file into a version-(n + 1) file. */
export type MigrationStep = (raw: RawBackup) => RawBackup;

/**
 * Step n upgrades a version-n file to version n + 1. Adding a stored field means bumping BACKUP_VERSION
 * and adding the step for the version before it here.
 *
 * 1 → 2 changes nothing; migrateBackup sets the version.
 */
export const MIGRATIONS: Readonly<Record<number, MigrationStep>> = { 1: (raw) => raw };

/** Walks `raw` (a version-`from` file) up to `target` one step at a time. Throws if a step is missing. */
export function migrateBackup(
  raw: RawBackup,
  from: number,
  steps: Readonly<Record<number, MigrationStep>> = MIGRATIONS,
  target: number = BACKUP_VERSION,
): RawBackup {
  let current = raw;
  for (let version = from; version < target; version++) {
    const step = steps[version];
    if (!step) throw new Error(`No migration from backup version ${version}`);
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return current;
}
