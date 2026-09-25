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

/**
 * Re-runs `query` whenever the Dexie tables it read change. `undefined` until the first result.
 * A failure is logged and, if given, passed to `onError` so the user can be told.
 */
export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList, onError?: (error: unknown) => void): T | undefined {
  const [value, setValue] = useState<T>();
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(
    () =>
      subscribeLiveQuery(query, setValue, (error) => {
        console.error('Live query failed', error);
        onErrorRef.current?.(error);
      }),
    deps,
  );
  return value;
}
