import { describe, expect, it } from 'vitest';
import {
  decodeThemeHint,
  encodeThemeHint,
  readThemeChoice,
  resolveTheme,
} from '../../src/domain/theme';

describe('readThemeChoice', () => {
  it('accepts the three choices and defaults everything else to dark', () => {
    expect(readThemeChoice('light')).toBe('light');
    expect(readThemeChoice('system')).toBe('system');
    expect(readThemeChoice('dark')).toBe('dark');
    expect(readThemeChoice('blue')).toBe('dark');
    expect(readThemeChoice(undefined)).toBe('dark');
  });
});

describe('resolveTheme', () => {
  it('follows the system only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('theme hint', () => {
  it('round-trips and rejects garbage', () => {
    expect(encodeThemeHint({ theme: 'light', night: false })).toBe('light');
    expect(encodeThemeHint({ theme: 'dark', night: true })).toBe('dark+night');
    expect(decodeThemeHint('light')).toEqual({ theme: 'light', night: false });
    expect(decodeThemeHint('dark+night')).toEqual({ theme: 'dark', night: true });
    expect(decodeThemeHint('purple')).toBeNull();
    expect(decodeThemeHint(null)).toBeNull();
  });
});
