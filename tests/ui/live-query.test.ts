import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { listBabies } from '../../src/db/babies';
import { subscribeLiveQuery } from '../../src/ui/useLiveQuery';

const opened: TrackerDb[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe('subscribeLiveQuery', () => {
  it('delivers results', async () => {
    const db = openDb(`test-${crypto.randomUUID()}`);
    opened.push(db);
    const next = vi.fn();
    const unsubscribe = subscribeLiveQuery(() => listBabies(db), next, vi.fn());
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith([]));
    unsubscribe();
  });

  it('hands a failing query to onError instead of only logging it', async () => {
    const failure = new Error('IndexedDB is unavailable');
    const next = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeLiveQuery(() => Promise.reject(failure), next, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(next).not.toHaveBeenCalled();
    unsubscribe();
  });
});
