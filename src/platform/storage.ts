export type PersistenceState = 'persisted' | 'denied' | 'unsupported';

export type StorageLike = Pick<StorageManager, 'persist' | 'persisted'>;

// navigator.storage is undefined outside secure contexts, hence the optional parameter.
export async function getPersistenceState(storage: StorageLike | undefined): Promise<PersistenceState> {
  if (!storage?.persisted) return 'unsupported';
  return (await storage.persisted()) ? 'persisted' : 'denied';
}

export async function requestPersistentStorage(storage: StorageLike | undefined): Promise<PersistenceState> {
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  if (await storage.persisted()) return 'persisted';
  return (await storage.persist()) ? 'persisted' : 'denied';
}
