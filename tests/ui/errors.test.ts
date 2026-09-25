import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { ValidationError } from '../../src/domain/rules';
import { bannerMessage } from '../../src/ui/ErrorBanner';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);

describe('bannerMessage', () => {
  it('shows the requested message for a failure to load data', () => {
    expect(bannerMessage(t, new Error('IndexedDB broke'), 'error.loadFailed')).toBe(
      'Veriler yüklenemedi. Uygulamayı kapatıp yeniden açın.',
    );
    expect(translate('en', 'error.loadFailed')).toBe("Couldn't load your data. Close and reopen the app.");
  });

  it('keeps the write-error messages when no message is requested', () => {
    expect(bannerMessage(t, new ValidationError(['already-running']))).toBe(t('rule.already-running'));
    expect(bannerMessage(t, new Error('quota'))).toBe('Kaydedilemedi. Lütfen tekrar deneyin.');
  });
});
