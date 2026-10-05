import { useRef, useState } from 'react';
import { recordEvents, type EventChange } from '../../db/events';
import { db } from '../../db/instance';
import type { Baby, EventDraft } from '../../domain/types';
import { useT } from '../app/I18nProvider';
import { messageFor, useReportError } from '../shared/ErrorBanner';
import { useMounted } from '../shared/useMounted';

/**
 * Saving from a log sheet: one write at a time (a second submit before the next render is refused), the
 * error line on a refusal, and the undo toast once written. The write runs with the moment of saving, so
 * "now" and "15 min ago" count from it. `save` stores drafts; `run` takes any write that returns its
 * changes (starting the pump timer).
 */
export function useEntrySave(
  babies: readonly Baby[],
  onClose: () => void,
  undoToast: (changes: readonly EventChange[]) => void,
) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false); // only for `disabled`; the ref below is the real guard
  const submitting = useRef(false); // set synchronously, so a second submit before the next render is refused
  const mounted = useMounted();
  const report = useReportError();
  const run = async (write: (now: number) => Promise<readonly EventChange[]>) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    const now = Date.now();
    try {
      const changes = await write(now);
      onClose();
      undoToast(changes);
      // The guard stays set: the form is done and only waits for its dialog to close.
    } catch (failure) {
      // Dismissed while saving: the form and its error line are gone, so the app's banner says it.
      if (!mounted()) {
        report(failure);
        return;
      }
      setError(messageFor(t, failure, babies));
      submitting.current = false;
      setPending(false);
    }
  };
  const save = (build: (now: number) => EventDraft[], endRunning: boolean) =>
    run((now) => recordEvents(db, build(now), now, { endRunning }));
  return { error, setError, pending, save, run };
}
