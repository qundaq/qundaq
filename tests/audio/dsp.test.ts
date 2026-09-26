import { describe, expect, it } from 'vitest';
import {
  addCircular,
  bandPass,
  filter,
  highPass,
  highShelf,
  lowPass,
  makeLoop,
  normalise,
  onePoleHighPass,
  onePoleLowPass,
  peak,
  periodSamples,
  rms,
  softLimit,
  toDb,
  weightedRms,
} from '../../src/audio/dsp';
import { mulberry32, whiteNoise } from '../../src/audio/random';

const RATE = 48_000;

function sine(freq: number, seconds = 1, amplitude = 1, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/** The gain a filter gives a steady sine, measured after its start-up transient. */
function gainAt(freq: number, apply: (input: Float32Array) => Float32Array): number {
  const input = sine(freq);
  const output = apply(input);
  const from = Math.round(0.2 * RATE);
  return rms(output, from) / rms(input, from);
}

describe('filters', () => {
  it('low-pass: passes below the cutoff, cuts well above it', () => {
    const lp = (x: Float32Array) => filter(x, lowPass(RATE, 1000));
    expect(gainAt(100, lp)).toBeCloseTo(1, 1);
    expect(gainAt(1000, lp)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(gainAt(10_000, lp)).toBeLessThan(0.02);
  });

  it('high-pass: cuts well below the cutoff, passes above it', () => {
    const hp = (x: Float32Array) => filter(x, highPass(RATE, 1000));
    expect(gainAt(100, hp)).toBeLessThan(0.02);
    expect(gainAt(10_000, hp)).toBeCloseTo(1, 1);
  });

  it('band-pass: 1 at the centre, low an octave or more away', () => {
    const bp = (x: Float32Array) => filter(x, bandPass(RATE, 1000, 2));
    expect(gainAt(1000, bp)).toBeCloseTo(1, 1);
    expect(gainAt(250, bp)).toBeLessThan(0.2);
    expect(gainAt(4000, bp)).toBeLessThan(0.2);
  });

  it('high shelf: +4 dB well above the corner, 0 dB well below', () => {
    const shelf = (x: Float32Array) => filter(x, highShelf(RATE, 1500, 4));
    expect(toDb(gainAt(12_000, shelf))).toBeCloseTo(4, 0);
    expect(toDb(gainAt(100, shelf))).toBeCloseTo(0, 0);
  });

  it('one-pole filters: 6 dB per octave around the cutoff, and they add up to the input', () => {
    const lp = (x: Float32Array) => onePoleLowPass(x, RATE, 500);
    const hp = (x: Float32Array) => onePoleHighPass(x, RATE, 500);
    expect(gainAt(50, lp)).toBeCloseTo(1, 1);
    expect(gainAt(8000, lp)).toBeLessThan(0.08);
    expect(gainAt(50, hp)).toBeLessThan(0.12);
    const input = sine(700, 0.1);
    const low = onePoleLowPass(input, RATE, 500);
    const high = onePoleHighPass(input, RATE, 500);
    for (let i = 0; i < input.length; i++) expect(low[i]! + high[i]!).toBeCloseTo(input[i]!, 5);
  });
});

describe('levels', () => {
  it('rms and peak of a sine', () => {
    const wave = sine(1000, 1, 0.5);
    expect(rms(wave)).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
    expect(peak(wave)).toBeCloseTo(0.5, 3);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('weighted RMS: a low hum counts far less than a mid tone, a high tone about 4 dB more', () => {
    const mid = weightedRms(sine(1000), RATE);
    expect(toDb(weightedRms(sine(50), RATE) / mid)).toBeLessThan(-15);
    expect(toDb(weightedRms(sine(8000), RATE) / mid)).toBeGreaterThan(2);
    expect(toDb(weightedRms(sine(8000), RATE) / mid)).toBeLessThan(5);
  });

  it('normalise: hits the weighted target and never lets a peak through', () => {
    const noise = whiteNoise(RATE, mulberry32(3));
    normalise(noise, RATE, -20);
    expect(toDb(weightedRms(noise, RATE))).toBeCloseTo(-20, 1);
    const loud = whiteNoise(RATE, mulberry32(4));
    loud[100] = 50; // a transient far above the rest
    normalise(loud, RATE, -6);
    expect(peak(loud)).toBeLessThan(0.9);
  });

  it('softLimit: leaves samples under the knee alone and bends the rest smoothly below the limit', () => {
    const samples = Float32Array.from([0.1, -0.5, 0.6, 0.7, -2, 100]);
    softLimit(samples, 0.9, 0.6);
    expect(samples[0]).toBeCloseTo(0.1, 6);
    expect(samples[1]).toBeCloseTo(-0.5, 6);
    expect(samples[2]).toBeCloseTo(0.6, 6);
    expect(samples[3]).toBeGreaterThan(0.6);
    expect(samples[3]).toBeLessThan(0.7);
    expect(samples[4]).toBeLessThan(-0.6);
    expect(samples[4]).toBeGreaterThan(-0.9);
    expect(samples[5]).toBeLessThanOrEqual(0.9);
  });
});

describe('makeLoop', () => {
  it('returns length − fade samples and joins the tail to the head without a jump', () => {
    const wave = sine(3, 2); // slow: any jump at the loop point would stand out
    const loop = makeLoop(wave, RATE, 0.5);
    expect(loop.length).toBe(wave.length - 0.5 * RATE);
    // Played in a loop, the last sample is followed by the first: the original neighbours.
    const step = Math.abs(loop[0]! - loop[loop.length - 1]!);
    expect(step).toBeLessThan((2 * Math.PI * 3) / RATE + 1e-4);
  });

  it('keeps the level of noise steady through the equal-power crossfade', () => {
    const noise = whiteNoise(10 * RATE, mulberry32(9));
    const loop = makeLoop(noise, RATE, 2);
    const fade = rms(loop, 0, 2 * RATE);
    const rest = rms(loop, 2 * RATE);
    expect(Math.abs(toDb(fade / rest))).toBeLessThan(0.25);
  });

  it('refuses a signal shorter than twice the crossfade', () => {
    expect(() => makeLoop(new Float32Array(100), RATE, 1)).toThrow('at least twice the crossfade');
  });
});

describe('placing on a circle', () => {
  it('periodSamples rounds a period to whole samples at the rate', () => {
    expect(periodSamples(60 / 70, 44_100)).toBe(37_800);
    expect(periodSamples(60 / 70, 48_000)).toBe(41_143);
    expect(periodSamples(0, 48_000)).toBe(1);
  });

  it('addCircular wraps what runs past the end to the start', () => {
    const target = new Float32Array(5);
    addCircular(target, Float32Array.from([1, 2, 3]), 3, 2);
    expect([...target]).toEqual([6, 0, 0, 2, 4]);
  });
});
