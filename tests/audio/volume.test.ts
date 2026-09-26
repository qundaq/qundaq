import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAP,
  busScale,
  capGain,
  clamp01,
  clampCap,
  isAboveDefaultCap,
  masterAfterCapChange,
  percent,
  sliderGain,
} from '../../src/audio/volume';

describe('volume', () => {
  it('maps a slider to a gain through slider², clamping anything outside 0..1', () => {
    expect(sliderGain(0.5)).toBe(0.25);
    expect(sliderGain(1)).toBe(1);
    expect(sliderGain(2)).toBe(1);
    expect(sliderGain(-1)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('keeps the cap within 0.2..1 and falls back to the default for anything unreadable', () => {
    expect(DEFAULT_CAP).toBe(0.5);
    expect(clampCap(0.8)).toBe(0.8);
    expect(clampCap(5)).toBe(1);
    expect(clampCap(0)).toBe(0.2);
    expect(clampCap(Number.NaN)).toBe(0.5);
    expect(clampCap('1')).toBe(0.5);
    expect(capGain(0.5)).toBe(0.25);
    expect(capGain(25)).toBe(1); // a stored 5 can never reach the speaker as a gain of 25
  });

  it('warns only above the default cap', () => {
    expect(isAboveDefaultCap(0.5)).toBe(false);
    expect(isAboveDefaultCap(0.55)).toBe(true);
  });

  it('scales the layer bus so that 1, 2 or 6 full layers are never louder than one', () => {
    expect(busScale([])).toBe(1);
    expect(busScale([1])).toBe(1);
    expect(busScale([1, 1])).toBeCloseTo(1 / Math.SQRT2, 9);
    expect(busScale([1, 1, 1, 1, 1, 1])).toBeCloseTo(1 / Math.sqrt(6), 9);
    // Quiet layers add up to less than one full layer: no scaling.
    expect(busScale([0.5, 0.5])).toBe(1);
    for (const levels of [[1], [1, 1], [0.7, 0.7, 0.7], [1, 1, 1, 1, 1, 1]]) {
      const power = levels.reduce(
        (sum, level) => sum + (sliderGain(level) * busScale(levels)) ** 2,
        0,
      );
      expect(power).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('raising the cap lowers the master so that what plays stays the same; lowering it keeps the master', () => {
    const master = masterAfterCapChange(0.6, 0.5, 1);
    expect(master).toBeCloseTo(0.3, 9);
    expect(sliderGain(master) * capGain(1)).toBeCloseTo(sliderGain(0.6) * capGain(0.5), 9);
    expect(masterAfterCapChange(0.6, 1, 0.5)).toBe(0.6);
    expect(masterAfterCapChange(0.6, 0.5, 0.5)).toBe(0.6);
  });

  it('writes a slider as a percentage for screen readers', () => {
    expect(percent(0.7)).toBe('70%');
    expect(percent(0.004)).toBe('0%');
  });
});
