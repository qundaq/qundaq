import { useRef } from 'react';
import type { Settings } from '../../db/settings';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { useT } from '../app/I18nProvider';
import { Sheet, useSheetSession } from '../shared/Sheet';
import { ImportForm } from './ImportForm';
import type { ImportChoices, ImportSource } from './importFile';
import { SheetMessage } from './SheetMessage';

export interface Props {
  source: ImportSource | null; // null: closed
  choices: ImportChoices;
  onChoicesChange: (next: ImportChoices) => void;
  /** "Önce bu cihazın yedeğini al": Shell swaps to the export sheet and comes back here afterwards. */
  onBackupFirst: () => void;
  onSettingsReplaced: (next: Settings) => void;
  /** The import was written (before the settings are read back), so Shell can start a crashed screen over. */
  onImported: () => void;
  onClose: () => void;
}

export function ImportSheet({ source, onClose, onImported, ...rest }: Props) {
  const t = useT();
  const session = useSheetSession(source);
  // The session whose import was written: a failure after that must not say that nothing changed.
  const committed = useRef<number | null>(null);
  return (
    <Sheet open={source !== null} title={t('import.title')} onClose={onClose}>
      {/* The sheet sits outside the screens' boundary: a render error here shows its failure, not a blank app. */}
      {session && (
        <ErrorBoundary
          key={session.id}
          fallback={() => (
            <SheetMessage
              message={t(committed.current === session.id ? 'import.failedAfter' : 'import.failed')}
              onClose={onClose}
            />
          )}
        >
          <ImportForm
            source={session.value}
            onClose={onClose}
            onCommitted={() => {
              committed.current = session.id;
              onImported();
            }}
            {...rest}
          />
        </ErrorBoundary>
      )}
    </Sheet>
  );
}

export type Phase = 'preview' | 'applying' | 'done' | 'failed';
