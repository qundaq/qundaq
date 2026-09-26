import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { lastSoundOf, layerNames, mixLayerNames, remainingText, sameLastSound, statusText, toSavedSound, withCapRescale } from '../../src/ui/sounds/text';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const NOW = 1_790_000_000_000;

describe('names and status', () => {
  it('joins the layer names in order, and names a mix by the sounds this version knows', () => {
    expect(layerNames(t, [{ soundId: 'white' }, { soundId: 'rain' }])).toBe('Beyaz gürültü + Yağmur');
    expect(mixLayerNames(t, [{ soundId: 'train', gain: 1 }, { soundId: 'shush', gain: 0.5 }])).toBe('Şşş');
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
  const state = { layers: [{ soundId: 'white' as const, level: 0.7 }], master: 0.5, timer: 30 as const };

  it('is the layers, the master and the chip, and maps back to what the engine restores', () => {
    const last = lastSoundOf(state);
    expect(last).toEqual({ layers: [{ soundId: 'white', level: 0.7 }], master: 0.5, timerMin: 30 });
    expect(toSavedSound(last)).toEqual({ layers: [{ soundId: 'white', level: 0.7 }], master: 0.5, timer: 30 });
  });

  it('writes a raised cap together with the lowered master, and leaves other patches alone', () => {
    expect(withCapRescale({ volumeCap: 1 }, state, 0.5)).toEqual({ volumeCap: 1, lastSound: { layers: [{ soundId: 'white', level: 0.7 }], master: 0.25, timerMin: 30 } });
    expect(withCapRescale({ volumeCap: 0.3 }, state, 0.5)).toEqual({ volumeCap: 0.3, lastSound: lastSoundOf(state) }); // lowering keeps the master
    expect(withCapRescale({ nightMode: true }, state, 0.5)).toEqual({ nightMode: true });
  });

  it('compares selections, and treats nothing stored as the default selection', () => {
    const last = lastSoundOf(state);
    expect(sameLastSound(last, { ...last, layers: [...last.layers] })).toBe(true);
    expect(sameLastSound(last, { ...last, master: 0.6 })).toBe(false);
    expect(sameLastSound(last, { ...last, layers: [{ soundId: 'white', level: 0.8 }] })).toBe(false);
    expect(sameLastSound(last, undefined)).toBe(false);
    expect(sameLastSound({ layers: [], master: 0.6, timerMin: 60 }, undefined)).toBe(true);
  });
});
