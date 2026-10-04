import { describe, expect, it } from 'vitest';
import { SOUNDS, soundById, soundUrl } from '../../src/audio/catalog';
import { SOUND_IDS } from '../../src/domain/sounds';

describe('the catalog', () => {
  it('has one entry per sound id, in the same order', () => {
    expect(SOUNDS.map((sound) => sound.id)).toEqual([...SOUND_IDS]);
  });
  it('finds a sound by id and gives a relative file URL', () => {
    expect(soundById('waves').nameKey).toBe('sound.waves');
    expect(soundUrl('airplane')).toBe('sounds/airplane.m4a');
  });
});
