import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { ValidationError } from '../../src/domain/rules';
import { bannerMessage, messageFor } from '../../src/ui/ErrorBanner';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);

describe('bannerMessage', () => {
  it('shows the requested message for a failure to load data', () => {
    expect(bannerMessage(t, new Error('IndexedDB broke'), 'error.loadFailed')).toBe(
      'Veriler yüklenemedi. Uygulamayı kapatıp yeniden açın.',
    );
    expect(translate('en', 'error.loadFailed')).toBe(
      "Couldn't load your data. Close and reopen the app.",
    );
  });

  it('keeps the write-error messages when no message is requested', () => {
    expect(bannerMessage(t, new ValidationError(['already-running']))).toBe(
      t('rule.already-running'),
    );
    expect(bannerMessage(t, new Error('quota'))).toBe('Kaydedilemedi. Lütfen tekrar deneyin.');
  });
});

describe('messageFor', () => {
  const babies = [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Can' },
  ];

  it('names the babies that already have a running entry', () => {
    expect(messageFor(t, new ValidationError(['already-running'], ['a', 'b']), babies)).toBe(
      'Ada, Can için zaten devam eden bir kayıt var.',
    );
    expect(translate('en', 'rule.already-running.named', { names: 'Ada' })).toBe(
      'Ada already has a running entry.',
    );
  });

  it('falls back to the plain message when no name is known', () => {
    expect(messageFor(t, new ValidationError(['already-running'], ['gone']), babies)).toBe(
      'Bu bebek için zaten devam eden bir kayıt var.',
    );
    expect(messageFor(t, new ValidationError(['already-running']))).toBe(
      'Bu bebek için zaten devam eden bir kayıt var.',
    );
  });

  it('shows the first rule otherwise', () => {
    expect(messageFor(t, new ValidationError(['too-long', 'in-future']))).toBe(t('rule.too-long'));
    expect(messageFor(t, new Error('disk full'))).toBe('Kaydedilemedi. Lütfen tekrar deneyin.');
  });
});
