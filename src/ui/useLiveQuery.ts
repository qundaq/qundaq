import { liveQuery } from 'dexie';
import { useEffect, useRef, useState, type DependencyList } from 'react';

/** Runs `query` now and whenever the Dexie tables it read change. Returns the unsubscribe function. */
export function subscribeLiveQuery<T>(
  query: () => Promise<T>,
  next: (value: T) => void,
  onError: (error: unknown) => void,
): () => void {
  const subscription = liveQuery(query).subscribe({ next, error: onError });
  return () => subscription.unsubscribe();
}

/** A live-query result together with the deps it was produced for. */
export interface Keyed<T> {
  key: string;
  value: T;
}

/** Deps are primitives by convention (numbers, strings, booleans, null), so their JSON is a faithful key. */
export function depsKey(deps: DependencyList): string {
  return JSON.stringify(deps);
}

/** The stored value, but only if it was produced for `key`. A result for older deps is never returned. */
export function valueFor<T>(state: Keyed<T> | undefined, key: string): T | undefined {
  return state !== undefined && state.key === key ? state.value : undefined;
}

/**
 * Re-runs `query` whenever the Dexie tables it read change, and whenever `deps` change. Returns
 * `undefined` until the query for the current deps has produced a value, so a screen never shows the
 * previous day's rows under the new day's heading. `deps` must be primitives.
 * A failure is logged and, if given, passed to `onError` so the user can be told.
 */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  deps: DependencyList,
  onError?: (error: unknown) => void,
): T | undefined {
  const key = depsKey(deps);
  const [state, setState] = useState<Keyed<T>>();
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    const unsubscribe = subscribeLiveQuery(
      query,
      (value) => setState({ key, value }),
      (error) => {
        console.error('Live query failed', error);
        onErrorRef.current?.(error);
      },
    );
    return () => {
      unsubscribe();
      // Forget this subscription's value too: after A → B → A the old A result must not come back
      // before the new subscription for A has produced one.
      setState(undefined);
    };
  }, [key]);
  return valueFor(state, key);
}
