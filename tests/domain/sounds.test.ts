import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAP,
  DEFAULT_TIMER,
  MAX_LAYERS,
  MIN_CAP,
  SOUND_IDS,
  TIMER_CHOICES,
  isSoundId,
  isTimerChoice,
  readLastSound,
  readVolumeCap,
  validMixLayers,
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

  it('reads an old multi-layer value as "nothing selected", keeping the master and the chip (R9)', () => {
    expect(
      readLastSound({ layers: [{ soundId: 'white', level: 0.7 }], master: 0.4, timerMin: null }),
    ).toEqual({ soundId: null, master: 0.4, timerMin: null });
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

describe('validMixLayers', () => {
  it('accepts 1–MAX_LAYERS unique sound ids of any version, with gains in 0..1', () => {
    expect(validMixLayers([{ soundId: 'white', gain: 0.7 }])).toBe(true);
    expect(validMixLayers([{ soundId: 'rain', gain: 0.4 }])).toBe(true); // a removed sound still round-trips
    expect(MAX_LAYERS).toBe(6);
  });

  it('rejects an empty list, too many layers, a repeated id, an empty or over-long id and a bad gain', () => {
    expect(validMixLayers([])).toBe(false);
    expect(
      validMixLayers(Array.from({ length: 7 }, (_, i) => ({ soundId: `s${i}`, gain: 0.5 }))),
    ).toBe(false);
    expect(
      validMixLayers([
        { soundId: 'white', gain: 0.5 },
        { soundId: 'white', gain: 0.6 },
      ]),
    ).toBe(false);
    expect(validMixLayers([{ soundId: '', gain: 0.5 }])).toBe(false);
    expect(validMixLayers([{ soundId: 'x'.repeat(41), gain: 0.5 }])).toBe(false);
    expect(validMixLayers([{ soundId: 'white', gain: 1.1 }])).toBe(false);
    expect(validMixLayers([{ soundId: 'white', gain: Number.NaN }])).toBe(false);
  });
});
