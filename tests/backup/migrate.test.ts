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

  it('throws when a step is missing', () => {
    expect(() => migrateBackup({ schemaVersion: 1 }, 1, {}, 2)).toThrow('No migration from backup version 1');
  });
});
