import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { listBabies } from '../../src/db/babies';
import { depsKey, subscribeLiveQuery, valueFor } from '../../src/ui/shared/useLiveQuery';

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

describe('keyed live-query values', () => {
  it('returns a value only for the deps it was produced for', () => {
    const today = depsKey([100, 200]);
    const state = { key: today, value: ['today'] };
    expect(valueFor(state, today)).toEqual(['today']);
    expect(valueFor(state, depsKey([50, 100]))).toBeUndefined();
    expect(valueFor(undefined, today)).toBeUndefined();
  });

  it('equal primitive deps give the same key, different ones a different key', () => {
    expect(depsKey([1, 'a', null, true])).toBe(depsKey([1, 'a', null, true]));
    expect(depsKey([1])).not.toBe(depsKey(['1']));
    expect(depsKey([])).toBe('[]');
  });
});
