import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import {
  lastSoundOf,
  lastSoundToPersist,
  layerNames,
  mixLayerNames,
  remainingText,
  sameLastSound,
  statusText,
  toSavedSound,
} from '../../src/ui/sounds/text';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const NOW = 1_790_000_000_000;

describe('names and status', () => {
  it('joins the layer names in order, and names a mix by the sounds this version knows', () => {
    expect(layerNames(t, [{ soundId: 'white' }, { soundId: 'rain' }])).toBe(
      'Beyaz gürültü + Yağmur',
    );
    expect(
      mixLayerNames(t, [
        { soundId: 'train', gain: 1 },
        { soundId: 'shush', gain: 0.5 },
      ]),
    ).toBe('Şşş');
    expect(mixLayerNames(t, [{ soundId: 'train', gain: 1 }])).toBe('(bilinmeyen ses)');
  });

  it('describes each status, naming the layers only while playing', () => {
    const layers = [{ soundId: 'white' as const, level: 0.7 }];
    expect(statusText(t, { status: 'playing', layers })).toBe('Çalıyor · Beyaz gürültü');
    expect(statusText(t, { status: 'paused', layers })).toBe('Duraklatıldı');
    expect(statusText(t, { status: 'stopped', layers })).toBe('Durdu');
    expect(statusText(t, { status: 'interrupted', layers })).toBe('Ses kesildi');
    expect(translate('en', 'sounds.status.interrupted')).toBe('Sound interrupted');
  });

  it('counts the minutes left, rounded up, and nothing without a timer', () => {
    expect(remainingText(t, NOW + 23 * 60_000 + 1, NOW)).toBe('24 dk kaldı');
    expect(remainingText(t, null, NOW)).toBeNull();
  });
});

describe('the last selection', () => {
  const state = {
    layers: [{ soundId: 'white' as const, level: 0.7 }],
    master: 0.5,
    timer: 30 as const,
  };

  it('is the layers, the master and the chip, and maps back to what the engine restores', () => {
    const last = lastSoundOf(state);
    expect(last).toEqual({ layers: [{ soundId: 'white', level: 0.7 }], master: 0.5, timerMin: 30 });
    expect(toSavedSound(last)).toEqual({
      layers: [{ soundId: 'white', level: 0.7 }],
      master: 0.5,
      timer: 30,
    });
  });

  describe('what the persist timer writes, read from the engine when it fires', () => {
    it('after a cap raise: the lowered master, never the master a render captured before the rescale', () => {
      // The cap write stored the pair (cap 1, master 0.25); the engine holds 0.25: nothing to write.
      const rescaled = { ...state, master: 0.25 };
      expect(lastSoundToPersist(rescaled, lastSoundOf(rescaled))).toBeNull();
      // A write that fires before the cap write lands stores the engine's 0.25, not the old 0.5.
      expect(lastSoundToPersist(rescaled, lastSoundOf(state))).toEqual({
        layers: [{ soundId: 'white', level: 0.7 }],
        master: 0.25,
        timerMin: 30,
      });
    });

    it('at a cold start: the restored selection matches storage, and a fresh app writes nothing', () => {
      // The timer reads the engine after restore() ran, not the default snapshot of the first render.
      expect(lastSoundToPersist(state, lastSoundOf(state))).toBeNull();
      expect(lastSoundToPersist({ layers: [], master: 0.6, timer: 60 }, undefined)).toBeNull();
    });

    it('nothing when unchanged; the new selection when it changed', () => {
      expect(lastSoundToPersist(state, lastSoundOf(state))).toBeNull();
      const louder = { ...state, layers: [{ soundId: 'white' as const, level: 0.9 }] };
      expect(lastSoundToPersist(louder, lastSoundOf(state))).toEqual(lastSoundOf(louder));
    });
  });

  it('compares selections, and treats nothing stored as the default selection', () => {
    const last = lastSoundOf(state);
    expect(sameLastSound(last, { ...last, layers: [...last.layers] })).toBe(true);
    expect(sameLastSound(last, { ...last, master: 0.6 })).toBe(false);
    expect(sameLastSound(last, { ...last, layers: [{ soundId: 'white', level: 0.8 }] })).toBe(
      false,
    );
    expect(sameLastSound(last, undefined)).toBe(false);
    expect(sameLastSound({ layers: [], master: 0.6, timerMin: 60 }, undefined)).toBe(true);
  });
});
