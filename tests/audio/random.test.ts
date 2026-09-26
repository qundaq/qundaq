import { describe, expect, it } from 'vitest';
import { mulberry32, whiteNoise } from '../../src/audio/random';

describe('mulberry32', () => {
  it('gives the same sequence for the same seed, and another for another seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(first);
  });

  it('stays in [0, 1) and spreads evenly', () => {
    const random = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const value = random();
      expect(value >= 0 && value < 1).toBe(true);
      buckets[Math.floor(value * 10)]! += 1;
    }
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });
});

describe('whiteNoise', () => {
  it('is uniform in [-1, 1) with a mean near zero', () => {
    const noise = whiteNoise(48_000, mulberry32(1));
    let sum = 0;
    for (const value of noise) {
      expect(value >= -1 && value < 1).toBe(true);
      sum += value;
    }
    expect(Math.abs(sum / noise.length)).toBeLessThan(0.01);
  });
});
