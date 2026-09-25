import { liveQuery } from 'dexie';
import { useEffect, useState, type DependencyList } from 'react';

/** Re-runs `query` whenever the Dexie tables it read change. `undefined` until the first result. */
export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: (error: unknown) => console.error('Live query failed', error),
    });
    return () => subscription.unsubscribe();
  }, deps);
  return value;
}
