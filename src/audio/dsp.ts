/**
 * Tiny DSP helpers for the sound generators: filters, levels and seamless loops. Pure functions on
 * Float32Arrays; no Web Audio, so everything here runs and is tested in Node.
 */

/** Biquad coefficients, normalised so that a0 = 1. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// Coefficients from the RBJ "Audio EQ Cookbook".
function normalised(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function omega(sampleRate: number, freq: number): { cos: number; sin: number } {
  const w = (2 * Math.PI * freq) / sampleRate;
  return { cos: Math.cos(w), sin: Math.sin(w) };
}

/** 2nd-order low-pass; Q 0.707 is maximally flat. */
export function lowPass(sampleRate: number, freq: number, q = Math.SQRT1_2): Biquad {
  const { cos, sin } = omega(sampleRate, freq);
  const alpha = sin / (2 * q);
  return normalised((1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

/** 2nd-order high-pass; Q 0.707 is maximally flat. */
export function highPass(sampleRate: number, freq: number, q = Math.SQRT1_2): Biquad {
  const { cos, sin } = omega(sampleRate, freq);
  const alpha = sin / (2 * q);
  return normalised((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
}

/** 2nd-order band-pass with a gain of 1 at `freq`. */
export function bandPass(sampleRate: number, freq: number, q: number): Biquad {
  const { cos, sin } = omega(sampleRate, freq);
  const alpha = sin / (2 * q);
  return normalised(alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha);
}

/** High shelf: `gainDb` above `freq`, 0 dB well below it (shelf slope 1). */
export function highShelf(sampleRate: number, freq: number, gainDb: number): Biquad {
  const a = 10 ** (gainDb / 40);
  const { cos, sin } = omega(sampleRate, freq);
  const alpha = (sin / 2) * Math.SQRT2;
  const root = 2 * Math.sqrt(a) * alpha;
  return normalised(
    a * (a + 1 + (a - 1) * cos + root),
    -2 * a * (a - 1 + (a + 1) * cos),
    a * (a + 1 + (a - 1) * cos - root),
    a + 1 - (a - 1) * cos + root,
    2 * (a - 1 - (a + 1) * cos),
    a + 1 - (a - 1) * cos - root,
  );
}

/** Runs `input` through the biquad (direct form I) into a new array. */
export function filter(input: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** 1st-order low-pass (6 dB per octave) into a new array. */
export function onePoleLowPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  const out = new Float32Array(input.length);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    y += k * (input[i]! - y);
    out[i] = y;
  }
  return out;
}

/** 1st-order high-pass (the input minus its 1st-order low-pass) into a new array. */
export function onePoleHighPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const low = onePoleLowPass(input, sampleRate, cutoff);
  for (let i = 0; i < low.length; i++) low[i] = input[i]! - low[i]!;
  return low;
}

/** Root mean square of `samples[from, to)`. */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! * samples[i]!;
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/** Largest absolute sample value. */
export function peak(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]!));
  return max;
}

export function toDb(value: number): number {
  return 20 * Math.log10(value);
}

/**
 * RMS as a phone speaker plays it (a rough K-weighting): a 2nd-order high-pass at 150 Hz, where an
 * iPhone speaker gives out, and a +4 dB shelf above 1.5 kHz, where the ear is most sensitive.
 */
export function weightedRms(samples: Float32Array, sampleRate: number): number {
  return rms(filter(filter(samples, highPass(sampleRate, 150)), highShelf(sampleRate, 1500, 4)));
}

/**
 * Soft-knee limiter, in place: samples up to `knee` pass unchanged; above it they bend smoothly towards
 * `limit` (tanh), which they never reach.
 */
export function softLimit(samples: Float32Array, limit: number, knee = limit * (2 / 3)): void {
  const room = limit - knee;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const size = Math.abs(x);
    if (size > knee) samples[i] = Math.sign(x) * (knee + room * Math.tanh((size - knee) / room));
  }
}

/**
 * Scales `samples` in place to a weighted RMS of `targetDb` dBFS. If a peak then exceeds `peakLimit`,
 * the soft-knee limiter takes the transients down (the weighted RMS drops a little with them).
 */
export function normalise(samples: Float32Array, sampleRate: number, targetDb: number, peakLimit = 0.9): Float32Array {
  const current = weightedRms(samples, sampleRate);
  if (current === 0) return samples;
  const gain = 10 ** (targetDb / 20) / current;
  for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * gain;
  if (peak(samples) > peakLimit) softLimit(samples, peakLimit);
  return samples;
}

/**
 * A seamless loop: returns the first `length − fade` samples, where the first `fade` of them are the
 * equal-power mix of the original tail (fading out) and head (fading in). Played with `loop = true`, the
 * last sample (original index length − fade − 1) is followed by the tail's first sample, its original
 * neighbour. Equal power keeps the level of uncorrelated content (noise) steady through the crossfade;
 * never use it for content in step with itself (a rhythm), which gains up to 3 dB there.
 */
export function makeLoop(samples: Float32Array, sampleRate: number, fadeSeconds: number): Float32Array {
  const fade = Math.round(fadeSeconds * sampleRate);
  const length = samples.length - fade;
  if (fade <= 0 || length < fade) throw new Error('makeLoop: the signal must be at least twice the crossfade');
  const out = samples.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const angle = ((i + 0.5) / fade) * (Math.PI / 2);
    out[i] = samples[i]! * Math.sin(angle) + samples[length + i]! * Math.cos(angle);
  }
  return out;
}

/** A period in whole samples at this rate, so a rhythm repeats exactly and a loop can hold whole periods. */
export function periodSamples(seconds: number, sampleRate: number): number {
  return Math.max(1, Math.round(seconds * sampleRate));
}

/** Adds `source` into `target` starting at `offset`, wrapping around the end: placing a sound on a circle. */
export function addCircular(target: Float32Array, source: Float32Array, offset: number, gain = 1): void {
  const length = target.length;
  for (let i = 0; i < source.length; i++) {
    const at = (offset + i) % length;
    target[at] = target[at]! + source[i]! * gain;
  }
}
