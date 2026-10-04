import { describe, expect, it } from 'vitest';
import {
  CROSSFADE_SECONDS,
  SILENCE_THRESHOLD,
  crossfadeLoop,
  trimSilence,
} from '../../src/audio/loop';

describe('trimSilence', () => {
  it('cuts silence at both ends and keeps what is between', () => {
    const samples = new Float32Array([0, 0, 0.5, -0.4, 0.3, 0, 0, 0]);
    expect(trimSilence(samples)).toEqual({ start: 2, end: 5 });
  });

  it('keeps a file with no silence whole', () => {
    expect(trimSilence(new Float32Array([0.2, -0.3, 0.4]))).toEqual({ start: 0, end: 3 });
  });

  it('keeps an entirely silent file whole rather than returning an empty range', () => {
    expect(trimSilence(new Float32Array(100))).toEqual({ start: 0, end: 100 });
  });

  it('counts a sample exactly at the threshold as silence and one just above it as sound', () => {
    const above = SILENCE_THRESHOLD * 1.01;
    expect(
      trimSilence(new Float32Array([SILENCE_THRESHOLD, above, above, SILENCE_THRESHOLD])),
    ).toEqual({
      start: 1,
      end: 3,
    });
  });

  it('handles an empty buffer', () => {
    expect(trimSilence(new Float32Array(0))).toEqual({ start: 0, end: 0 });
  });
});

describe('crossfadeLoop', () => {
  it('is shorter by the fade length, leaves the middle untouched and never mutates its input', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7));
    const copy = samples.slice();
    const out = crossfadeLoop(samples, 100);
    expect(out).toHaveLength(900);
    expect(Array.from(out.subarray(100, 900))).toEqual(Array.from(samples.subarray(100, 900)));
    expect(samples).toEqual(copy);
  });

  it('starts at the tail it blends in and ends where the file did, so the wrap is continuous', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7));
    const out = crossfadeLoop(samples, 100);
    // out[0] is (almost) the sample that followed out[end] in the original file.
    expect(Math.abs(out[0]! - samples[900]!)).toBeLessThan(0.01);
    expect(out[899]).toBe(samples[899]);
  });

  it('removes the click of a loop whose start and end do not match', () => {
    const rate = 8000;
    const freq = 440;
    const samples = Float32Array.from({ length: 8017 }, (_, i) =>
      Math.sin((2 * Math.PI * freq * i) / rate),
    );
    const rawJump = Math.abs(samples[0]! - samples[samples.length - 1]!);
    const fade = Math.round(CROSSFADE_SECONDS * rate);
    const out = crossfadeLoop(samples, fade);
    const crossJump = Math.abs(out[0]! - out[out.length - 1]!);
    const largestStep = (2 * Math.PI * freq) / rate;
    expect(rawJump).toBeGreaterThan(0.5);
    expect(crossJump).toBeLessThan(largestStep * 1.2);
  });

  it('keeps the blended region within equal-power bounds for a constant signal', () => {
    const out = crossfadeLoop(new Float32Array(1000).fill(1), 100);
    for (let i = 0; i < 100; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(out[i]).toBeLessThanOrEqual(Math.SQRT2 + 1e-6);
    }
  });

  it('returns an unchanged copy when the file is too short to fade (fade must stay under a quarter of it)', () => {
    const samples = Float32Array.from({ length: 100 }, (_, i) => i / 100);
    const out = crossfadeLoop(samples, 30);
    expect(Array.from(out)).toEqual(Array.from(samples));
    expect(out).not.toBe(samples);
    expect(Array.from(crossfadeLoop(samples, 0))).toEqual(Array.from(samples));
  });
});
