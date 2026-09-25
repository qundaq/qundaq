import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ValidationError } from '../domain/rules';
import { useT, type TranslateFn } from './I18nProvider';

type ReportError = (error: unknown) => void;

const ErrorContext = createContext<ReportError>((error) => console.error(error));

export function messageFor(t: TranslateFn, error: unknown): string {
  const first = error instanceof ValidationError ? error.violations[0] : undefined;
  return first ? t(`rule.${first}`) : t('error.saveFailed');
}

/** Shows failures of actions taken outside a sheet (timers, settings) in a dismissible banner. */
export function ErrorProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [message, setMessage] = useState<string | null>(null);
  const report = useCallback<ReportError>(
    (error) => {
      console.error(error);
      setMessage(messageFor(t, error));
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
