import { describe, expect, it, vi } from 'vitest';
import { getPersistenceState, requestPersistentStorage } from '../../src/platform/storage';

function fakeStorage(persisted: boolean, grant: boolean) {
  return {
    persisted: vi.fn(() => Promise.resolve(persisted)),
    persist: vi.fn(() => Promise.resolve(grant)),
  };
}

describe('getPersistenceState', () => {
  it('is unsupported without a StorageManager', async () => {
    expect(await getPersistenceState(undefined)).toBe('unsupported');
  });

  it('reports persisted / denied without requesting', async () => {
    const yes = fakeStorage(true, true);
    const no = fakeStorage(false, true);
    expect(await getPersistenceState(yes)).toBe('persisted');
    expect(await getPersistenceState(no)).toBe('denied');
    expect(no.persist).not.toHaveBeenCalled();
  });
});

describe('requestPersistentStorage', () => {
  it('is unsupported without a StorageManager', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
  });

  it('does not ask again when already persisted', async () => {
    const storage = fakeStorage(true, false);
    expect(await requestPersistentStorage(storage)).toBe('persisted');
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('asks and reports the answer', async () => {
    expect(await requestPersistentStorage(fakeStorage(false, true))).toBe('persisted');
    expect(await requestPersistentStorage(fakeStorage(false, false))).toBe('denied');
  });
});
