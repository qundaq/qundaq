import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey } from '../i18n';

export type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<TranslateFn>((key, vars) => translate('tr', key, vars));

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo<TranslateFn>(() => (key, vars) => translate(locale, key, vars), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): TranslateFn {
  return useContext(I18nContext);
}
