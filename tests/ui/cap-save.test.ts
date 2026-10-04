import { describe, expect, it } from 'vitest';
import { capToSave } from '../../src/ui/settings/CapCard';

describe('capToSave', () => {
  it('saves nothing for the value last handed over, and the value otherwise', () => {
    expect(capToSave(0.5, 0.5)).toBeNull();
    expect(capToSave(0.8, 0.5)).toBe(0.8);
  });

  it('saves a move back to the stored cap while a higher one was already handed over (0.5, 0.8, 0.5)', () => {
    const stored = 0.5; // the prop stays here: the save of 0.8 is still in flight
    const handed: number[] = [];
    let lastSent = stored;
    for (const move of [0.8, 0.5]) {
      const toSave = capToSave(move, lastSent);
      if (toSave !== null) {
        handed.push(toSave);
        lastSent = toSave;
      }
    }
    expect(handed).toEqual([0.8, 0.5]);
    expect(lastSent).toBe(0.5);
  });
});
