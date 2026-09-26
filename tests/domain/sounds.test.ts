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

describe('sound ids and layers', () => {
  it('knows the nine sounds and at most six layers', () => {
    expect(SOUND_IDS).toHaveLength(9);
    expect(isSoundId('white')).toBe(true);
    expect(isSoundId('train')).toBe(false);
    expect(isSoundId(7)).toBe(false);
    expect(MAX_LAYERS).toBe(6);
  });

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
  const good = {
    layers: [
      { soundId: 'white', level: 0.7 },
      { soundId: 'rain', level: 0 },
    ],
    master: 1,
    timerMin: 15,
  };

  it('keeps a well-formed selection, an empty one included', () => {
    expect(readLastSound(good)).toEqual(good);
    expect(readLastSound({ layers: [], master: 0.6, timerMin: null })).toEqual({
      layers: [],
      master: 0.6,
      timerMin: null,
    });
  });

  it.each([
    ['not an object', 'white'],
    ['an array', []],
    ['no layers', { master: 0.6, timerMin: null }],
    ['an unknown sound', { ...good, layers: [{ soundId: 'train', level: 0.5 }] }],
    ['a level above 1', { ...good, layers: [{ soundId: 'white', level: 1.5 }] }],
    ['a level that is not a number', { ...good, layers: [{ soundId: 'white', level: '0.5' }] }],
    [
      'the same sound twice',
      {
        ...good,
        layers: [
          { soundId: 'white', level: 0.5 },
          { soundId: 'white', level: 0.5 },
        ],
      },
    ],
    [
      'seven layers',
      {
        ...good,
        layers: ['white', 'pink', 'brown', 'rain', 'waves', 'wind', 'heartbeat'].map((soundId) => ({
          soundId,
          level: 0.5,
        })),
      },
    ],
    ['a master out of range', { ...good, master: -0.1 }],
    ['a timer that is not a chip', { ...good, timerMin: 45 }],
    ['a missing timer', { layers: good.layers, master: 0.5 }],
  ])('drops a selection with %s', (_label, value) => {
    expect(readLastSound(value)).toBeUndefined();
  });
});

describe('validMixLayers', () => {
  it('accepts 1–6 known, unique sounds with gains in 0..1', () => {
    expect(validMixLayers([{ soundId: 'white', gain: 0.7 }])).toBe(true);
    expect(
      validMixLayers(
        ['white', 'pink', 'brown', 'rain', 'waves', 'wind'].map((soundId) => ({
          soundId,
          gain: 1,
        })),
      ),
    ).toBe(true);
    expect(validMixLayers([])).toBe(false);
    expect(
      validMixLayers(
        ['white', 'pink', 'brown', 'rain', 'waves', 'wind', 'shush'].map((soundId) => ({
          soundId,
          gain: 1,
        })),
      ),
    ).toBe(false);
    expect(validMixLayers([{ soundId: 'train', gain: 0.7 }])).toBe(false);
    expect(validMixLayers([{ soundId: 'white', gain: 1.1 }])).toBe(false);
    expect(validMixLayers([{ soundId: 'white', gain: Number.NaN }])).toBe(false);
    expect(
      validMixLayers([
        { soundId: 'white', gain: 0.5 },
        { soundId: 'white', gain: 0.6 },
      ]),
    ).toBe(false);
  });
});
