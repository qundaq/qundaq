import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAP,
  DEFAULT_TIMER,
  MIN_CAP,
  SOUND_IDS,
  TIMER_CHOICES,
  isSoundId,
  isTimerChoice,
  readLastSound,
  readVolumeCap,
} from '../../src/domain/sounds';

describe('sound ids', () => {
  it('are exactly the four bundled recordings, in tile order', () => {
    expect([...SOUND_IDS]).toEqual(['white', 'waves', 'windchime', 'airplane']);
    expect(isSoundId('windchime')).toBe(true);
    expect(isSoundId('pink')).toBe(false);
    expect(isSoundId(7)).toBe(false);
  });
});

describe('timer chips', () => {
  it('offers 15, 30 and 60 minutes and ∞, with 60 selected by default', () => {
    expect(TIMER_CHOICES).toEqual([15, 30, 60, null]);
    expect(DEFAULT_TIMER).toBe(60);
    expect(isTimerChoice(30)).toBe(true);
    expect(isTimerChoice(null)).toBe(true);
    expect(isTimerChoice(45)).toBe(false);
    expect(isTimerChoice('15')).toBe(false);
  });
});

describe('readVolumeCap', () => {
  it('keeps a finite cap within 0.2–1 and returns the default for anything else', () => {
    expect(MIN_CAP).toBe(0.2);
    expect(DEFAULT_CAP).toBe(0.5);
    expect(readVolumeCap(0.2)).toBe(0.2);
    expect(readVolumeCap(1)).toBe(1);
    expect(readVolumeCap(0.19)).toBe(DEFAULT_CAP);
    expect(readVolumeCap(5)).toBe(DEFAULT_CAP);
    expect(readVolumeCap(Number.NaN)).toBe(DEFAULT_CAP);
    expect(readVolumeCap('0.8')).toBe(DEFAULT_CAP);
    expect(readVolumeCap(undefined)).toBe(DEFAULT_CAP);
  });
});

describe('readLastSound', () => {
  const stored = { soundId: 'windchime', master: 0.6, timerMin: 30 };

  it('reads a well-formed selection', () => {
    expect(readLastSound(stored)).toEqual(stored);
    expect(readLastSound({ ...stored, soundId: null })).toEqual({ ...stored, soundId: null });
  });

  it('reads a removed sound as nothing selected', () => {
    expect(readLastSound({ ...stored, soundId: 'pink' })).toEqual({ ...stored, soundId: null });
  });

  it('drops a malformed master or timer whole', () => {
    expect(readLastSound({ ...stored, master: 2 })).toBeUndefined();
    expect(readLastSound({ ...stored, master: Number.NaN })).toBeUndefined();
    expect(readLastSound({ ...stored, timerMin: 45 })).toBeUndefined();
    expect(readLastSound(null)).toBeUndefined();
    expect(readLastSound([stored])).toBeUndefined();
    expect(readLastSound('x')).toBeUndefined();
  });
});
