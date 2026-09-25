import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ValidationError } from '../domain/rules';
import type { MessageKey } from '../i18n';
import { useT, type TranslateFn } from './I18nProvider';

export interface ReportOptions {
  /** Show this message instead of the one derived from the error (which assumes a failed write). */
  messageKey?: MessageKey;
}

type ReportError = (error: unknown, options?: ReportOptions) => void;

const ErrorContext = createContext<ReportError>((error) => console.error(error));

export function messageFor(t: TranslateFn, error: unknown): string {
  const first = error instanceof ValidationError ? error.violations[0] : undefined;
  return first ? t(`rule.${first}`) : t('error.saveFailed');
}

export function bannerMessage(t: TranslateFn, error: unknown, messageKey?: MessageKey): string {
  return messageKey ? t(messageKey) : messageFor(t, error);
}

/** Shows failures of actions taken outside a sheet (timers, settings) and of reading data in a dismissible banner. */
export function ErrorProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const report = useCallback<ReportError>(
    (error, options) => {
      console.error(error);
      setMessage(bannerMessage(t, error, options?.messageKey));
    },
    [t],
  );
  return (
    <ErrorContext.Provider value={report}>
      {message && (
        <div className="alert" role="alert">
          <span>{message}</span>
          <button type="button" className="btn" onClick={() => setMessage(null)}>
            {t('common.dismiss')}
          </button>
        </div>
      )}
      {children}
    </ErrorContext.Provider>
  );
}

export function useReportError(): ReportError {
  return useContext(ErrorContext);
}

/** For `useLiveQuery(..., onError)`: tells the user their data could not be read. */
export function useReportLoadError(): (error: unknown) => void {
  const report = useReportError();
  return useCallback((error: unknown) => report(error, { messageKey: 'error.loadFailed' }), [report]);
}
