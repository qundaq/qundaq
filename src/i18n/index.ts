import { tr, type MessageKey } from './tr';
import { en } from './en';

export type { MessageKey };
export type Locale = 'tr' | 'en';
export const LOCALES: readonly Locale[] = ['tr', 'en'];

const dictionaries: Record<Locale, Record<MessageKey, string>> = { tr, en };

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[locale][key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function detectLocale(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
