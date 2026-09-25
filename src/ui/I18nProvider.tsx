import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n';

export type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<TranslateFn>((key, vars) => translate('tr', key, vars));
const LocaleContext = createContext<Locale>('tr');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo<TranslateFn>(() => (key, vars) => translate(locale, key, vars), [locale]);
  return (
    <LocaleContext.Provider value={locale}>
      <I18nContext.Provider value={t}>{children}</I18nContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useT(): TranslateFn {
  return useContext(I18nContext);
}

/** The UI locale, for Intl number and date formatting. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
