import { translate, type MessageKey } from '../../src/i18n';

/** UI text as the e2e app shows it (Playwright runs it in tr-TR). Specs never spell UI text themselves. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate('tr', key, vars);
}

/** A key's text with "…" or "·" inside a RegExp locator. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
