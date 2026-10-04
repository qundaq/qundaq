import { describe, expect, it } from 'vitest';
import { DEFAULT_MASTER } from '../../src/audio/volume';
import { DEFAULT_TIMER } from '../../src/domain/sounds';
import { translate, type MessageKey } from '../../src/i18n';
import {
  lastSoundOf,
  lastSoundToPersist,
  remainingText,
  sameLastSound,
  soundName,
  statusText,
  toSavedSound,
} from '../../src/ui/sounds/text';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const NOW = 1_790_000_000_000;

describe('names and status', () => {
  it('names the current sound, and nothing for no selection', () => {
    expect(soundName(t, 'white')).toBe('White noise');
    expect(soundName(t, 'windchime')).toBe('Wind chimes');
    expect(soundName(t, null)).toBe('');
  });

  it('describes each status, naming the sound only while playing', () => {
    expect(statusText(t, { status: 'playing', current: 'waves' })).toBe('Playing · Waves');
    expect(statusText(t, { status: 'paused', current: 'waves' })).toBe('Paused');
    expect(statusText(t, { status: 'stopped', current: 'waves' })).toBe('Stopped');
    expect(statusText(t, { status: 'interrupted', current: 'waves' })).toBe('Sound interrupted');
  });

  it('counts the minutes left, rounded up, and nothing without a timer', () => {
    expect(remainingText(t, NOW + 23 * 60_000 + 1, NOW)).toBe('24 min left');
    expect(remainingText(t, null, NOW)).toBeNull();
  });
});

describe('the last selection', () => {
  const state = { current: 'windchime' as const, master: 0.4, timer: 30 as const };

  it('is the sound, the master and the chip, and maps back to what the engine restores', () => {
    const last = lastSoundOf(state);
    expect(last).toEqual({ soundId: 'windchime', master: 0.4, timerMin: 30 });
    expect(toSavedSound(last)).toEqual({ soundId: 'windchime', master: 0.4, timer: 30 });
  });

  describe('what the persist timer writes, read from the engine when it fires', () => {
    it('after a cap raise: the lowered master, never the master a render captured before the rescale', () => {
      const rescaled = { ...state, master: 0.25 };
      expect(lastSoundToPersist(rescaled, lastSoundOf(rescaled))).toBeNull();
      expect(lastSoundToPersist(rescaled, lastSoundOf(state))).toEqual({
        soundId: 'windchime',
        master: 0.25,
        timerMin: 30,
      });
    });

    it('at a cold start: the restored selection matches storage, and a fresh app writes nothing', () => {
      expect(lastSoundToPersist(state, lastSoundOf(state))).toBeNull();
      expect(
        lastSoundToPersist(
          { current: null, master: DEFAULT_MASTER, timer: DEFAULT_TIMER },
          undefined,
        ),
      ).toBeNull();
    });

    it('nothing when unchanged; the new selection when it changed', () => {
      expect(lastSoundToPersist(state, lastSoundOf(state))).toBeNull();
      const other = { ...state, current: 'white' as const };
      expect(lastSoundToPersist(other, lastSoundOf(state))).toEqual(lastSoundOf(other));
    });
  });

  it('compares selections, and treats nothing stored as the default selection', () => {
    const fresh = lastSoundOf({ current: null, master: DEFAULT_MASTER, timer: DEFAULT_TIMER });
    expect(sameLastSound(fresh, undefined)).toBe(true);
    expect(sameLastSound({ ...fresh, soundId: 'white' }, undefined)).toBe(false);
    expect(sameLastSound({ ...fresh, soundId: 'white' }, { ...fresh, soundId: 'white' })).toBe(
      true,
    );
    expect(sameLastSound({ ...fresh, master: 0.2 }, fresh)).toBe(false);
  });
});
