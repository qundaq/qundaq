import { useCallback } from 'react';
import { restoreEvents, type EventChange } from '../../db/events';
import { db } from '../../db/instance';
import type { Id } from '../../domain/types';
import { useLocale, useT } from '../app/I18nProvider';
import { useReportError } from '../shared/ErrorBanner';
import { TOAST_UNDO_MS } from '../shared/toast';
import { useToast } from '../shared/ToastBanner';
import { undoMessage } from './undo';

/** After a save or a stop: the saved-message toast with an undo action (common.undo). Undo restores the snapshots, or says why it cannot. */
export function useUndoToast(nameOf: (babyId: Id) => string) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const report = useReportError();
  return useCallback(
    (changes: readonly EventChange[]) => {
      if (changes.length === 0) return;
      toast({
        message: undoMessage(t, locale, changes, nameOf),
        durationMs: TOAST_UNDO_MS,
        action: {
          label: t('common.undo'),
          onAction: () => {
            restoreEvents(db, changes)
              .then((restored) => {
                if (!restored) toast({ message: t('toast.undoFailed'), tone: 'info' });
              })
              .catch((error: unknown) => report(error));
          },
        },
      });
    },
    [t, locale, toast, report, nameOf],
  );
}
