import { useEffect, useState } from 'react';
import { getOfflineStatus, type OfflineStatus } from '../platform/sw-client';
import { getPersistenceState, type PersistenceState } from '../platform/storage';

const POLL_MS = 1500;

// Polls until the service worker reports every file cached (first install takes a moment).
export function useOfflineStatus(): OfflineStatus | null {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      const next = await getOfflineStatus();
      if (cancelled) return;
      setStatus(next);
      if (next.state === 'not-ready') timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return status;
}

export function usePersistenceState(): PersistenceState | null {
  const [state, setState] = useState<PersistenceState | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getPersistenceState(navigator.storage).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
