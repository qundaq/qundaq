import { describe, expect, it } from 'vitest';
import { tr } from '../src/i18n/tr';
import { en } from '../src/i18n/en';
import { detectLocale, translate } from '../src/i18n';

describe('dictionaries', () => {
  it('Turkish and English have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it('has no empty strings', () => {
    for (const dict of [tr, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });
});

describe('translate', () => {
  it('returns the string for the locale', () => {
    expect(translate('tr', 'tab.settings')).toBe(tr['tab.settings']);
    expect(translate('en', 'tab.settings')).toBe('Settings');
  });

  it('interpolates variables', () => {
    expect(translate('en', 'settings.about.version', { version: '1.2.3', commit: 'abc1234' })).toBe(
      'Version 1.2.3 (abc1234)',
    );
  });

  it('leaves unknown placeholders intact', () => {
    expect(translate('en', 'settings.about.version', { version: '1.2.3' })).toBe(
      'Version 1.2.3 ({commit})',
    );
  });
});

describe('English copy', () => {
  it('the sheet close button reads "Close" (spec §5.1)', () => {
    expect(translate('en', 'common.dismiss')).toBe('Close');
  });

  it('the one-timer notes read the same for one baby and for two', () => {
    expect(translate('en', 'conflict.sleepEnds', { names: 'Ada, Cal' })).toBe(
      'Asleep: Ada, Cal. Starting the feed ends the sleep then.',
    );
    expect(translate('en', 'conflict.feedEnds', { names: 'Ada' })).toBe(
      'Feeding: Ada. Starting the sleep ends the feed then.',
    );
  });
});

describe('detectLocale', () => {
  it.each([
    ['tr-TR', 'tr'],
    ['tr', 'tr'],
    ['TR-tr', 'tr'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
    [undefined, 'en'],
  ] as const)('%s → %s', (input, expected) => {
    expect(detectLocale(input)).toBe(expected);
  });
});
