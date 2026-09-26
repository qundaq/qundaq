import { describe, expect, it } from 'vitest';
import { BACKUP_VERSION } from '../../src/backup/format';
import { MIGRATIONS, migrateBackup, type RawBackup } from '../../src/backup/migrate';

describe('migrateBackup', () => {
  it('has a step for every version below the current one', () => {
    for (let version = 1; version < BACKUP_VERSION; version++) expect(MIGRATIONS[version], `step ${version}`).toBeTypeOf('function');
  });

  it('leaves a current file alone', () => {
    const raw: RawBackup = { app: 'qundaq', schemaVersion: BACKUP_VERSION, babies: [] };
    expect(migrateBackup(raw, BACKUP_VERSION)).toBe(raw);
  });

  it('walks the steps one version at a time, in order', () => {
    const steps = {
      1: (raw: RawBackup) => ({ ...raw, trail: [...(raw.trail as string[]), 'one'] }),
      2: (raw: RawBackup) => ({ ...raw, trail: [...(raw.trail as string[]), 'two'] }),
    };
    expect(migrateBackup({ schemaVersion: 1, trail: [] }, 1, steps, 3)).toEqual({ schemaVersion: 3, trail: ['one', 'two'] });
    expect(migrateBackup({ schemaVersion: 2, trail: [] }, 2, steps, 3)).toEqual({ schemaVersion: 3, trail: ['two'] });
  });

  it('1 → 2 changes nothing but the version: a version-1 file has mixes: [] and a crafted one reads as version 2', () => {
    const raw: RawBackup = { app: 'qundaq', schemaVersion: 1, babies: [], events: [], mixes: [{ id: 'm1' }] };
    expect(migrateBackup(raw, 1)).toEqual({ ...raw, schemaVersion: 2 });
    expect(BACKUP_VERSION).toBe(2);
  });

  it('throws when a step is missing', () => {
    expect(() => migrateBackup({ schemaVersion: 1 }, 1, {}, 2)).toThrow('No migration from backup version 1');
  });
});
