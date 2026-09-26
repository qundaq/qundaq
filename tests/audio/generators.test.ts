import { describe, expect, it } from 'vitest';
import { SOUNDS, generateSound, soundById } from '../../src/audio/catalog';
import { bandPass, filter, highPass, peak, periodSamples, rms, toDb, weightedRms } from '../../src/audio/dsp';
import {
  BED_FADE_SECONDS,
  DUB_DELAY_SECONDS,
  HEARTBEAT_BPM,
  HEARTBEAT_TARGET_DB,
  SHUSH_PERIOD_SECONDS,
  SWELL_SECONDS,
  TARGET_DB,
  beatStarts,
  shushEnvelope,
  swellEnvelope,
} from '../../src/audio/generators';
import { mulberry32 } from '../../src/audio/random';
import { SOUND_IDS, type SoundId } from '../../src/domain/sounds';

const RATES = [44_100, 48_000] as const;

// Generated once per sound and rate: each takes tens of milliseconds.
const cache = new Map<string, Float32Array>();
function loop(id: SoundId, rate: number): Float32Array {
  const key = `${id}@${rate}`;
  let samples = cache.get(key);
  if (!samples) {
    samples = generateSound(id, rate);
    cache.set(key, samples);
  }
  return samples;
}

/** Byte-for-byte equality; much faster than a deep equal over a million samples. */
function sameSamples(a: Float32Array, b: Float32Array): boolean {
  return Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}

/** A window of `width` samples centred on `centre`, read around the loop (the loop point included). */
function windowAround(x: Float32Array, centre: number, width: number): Float32Array {
  const out = new Float32Array(width);
  const start = centre - Math.floor(width / 2);
  for (let i = 0; i < width; i++) out[i] = x[(((start + i) % x.length) + x.length) % x.length]!;
  return out;
}

/** dB of the 200 ms window on the loop point, relative to the whole loop. */
function seamDeviation(x: Float32Array, rate: number): number {
  return toDb(rms(windowAround(x, 0, Math.round(0.2 * rate))) / rms(x));
}

/** The largest deviation of any other 200 ms window from the whole loop: the sound's own variation. */
function ownVariation(x: Float32Array, rate: number): number {
  const width = Math.round(0.2 * rate);
  let worst = 0;
  for (let centre = width; centre + width <= x.length - width; centre += width) {
    worst = Math.max(worst, Math.abs(toDb(rms(windowAround(x, centre, width)) / rms(x))));
  }
  return worst;
}

/** Sample-to-sample steps: a click at the loop point would be a step far above the usual ones. */
function stepPercentile(x: Float32Array, fraction: number): number {
  const steps = new Float32Array(x.length - 1);
  for (let i = 0; i + 1 < x.length; i++) steps[i] = Math.abs(x[i + 1]! - x[i]!);
  steps.sort();
  return steps[Math.floor(steps.length * fraction)]!;
}

/** Excess kurtosis + 3: about 3 for noise, clearly more for sparse transients. */
function kurtosis(x: Float32Array): number {
  let m2 = 0;
  let m4 = 0;
  for (const value of x) {
    m2 += value * value;
    m4 += value ** 4;
  }
  m2 /= x.length;
  m4 /= x.length;
  return m4 / (m2 * m2);
}

/** dB of the energy in a one-octave band around `centre`. */
function bandDb(x: Float32Array, rate: number, centre: number): number {
  return toDb(rms(filter(x, bandPass(rate, centre, 1.41))));
}

/** A smoothed |x| read around the loop (the smoother runs one extra lap so it has settled at the start). */
function envelope(x: Float32Array, rate: number, cutoff: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < x.length; i++) {
      y += k * (Math.abs(x[i]!) - y);
      if (lap === 1) out[i] = y;
    }
  }
  return out;
}

/** Index of the largest value in [from, to), read around the loop. */
function argmaxAround(x: Float32Array, from: number, to: number): number {
  let best = from;
  for (let i = from; i < to; i++) if (x[((i % x.length) + x.length) % x.length]! > x[((best % x.length) + x.length) % x.length]!) best = i;
  return ((best % x.length) + x.length) % x.length;
}

/**
 * dB of the loop's own high-pass energy right at the wrap, relative to the loudest such reading at many
 * other, evenly spaced positions round the loop (the 90th percentile: robust to a droplet or a beat
 * landing near the wrap by chance, which a plain "elsewhere average" is not). The signal is high-pass
 * filtered twice around the loop first, so the filter's state has settled into the loop's own steady
 * behaviour by the second lap (as `envelope` above does for a smoother). The cutoff sits close to Nyquist,
 * above the content these band-limited or naturally rolled-off sounds otherwise have there, so a hard
 * splice — which is broadband — shows up as a highly localised spike even where the sound's own transients
 * (a droplet, a beat) do not otherwise reach that high. Not meaningful for white or pink, which have real
 * energy at every frequency all the way to Nyquist: `blendKurtosisShift` below covers those two instead.
 */
function seamClickDb(x: Float32Array, rate: number): number {
  const doubled = new Float32Array(x.length * 2);
  doubled.set(x, 0);
  doubled.set(x, x.length);
  const trace = filter(doubled, highPass(rate, 0.35 * rate)).slice(x.length);
  const width = 6; // a 3-sample radius: about the high-pass's own settling time at this cutoff
  const wrapEnergy = rms(windowAround(trace, 0, width));
  const others: number[] = [];
  for (let c = width; c + width <= trace.length - width; c += width) others.push(rms(windowAround(trace, c, width)));
  others.sort((a, b) => a - b);
  const reference = others[Math.floor(others.length * 0.9)]!;
  return toDb(wrapEnergy / Math.max(reference, 1e-12));
}

/**
 * How much more Gaussian-shaped the loop's own samples are in the middle of its first crossfade (where
 * `makeLoop` blends two independent stretches of the bed roughly 50/50) than elsewhere in the loop: the
 * blend window's kurtosis minus the mean kurtosis of several windows spread across the rest of the loop.
 * Mixing two independent copies of the same non-Gaussian noise moves its distribution shape towards
 * Gaussian (the central limit theorem) even though the mix's level and spectrum are unchanged (an
 * equal-power blend is designed to preserve both) — a shift a bare splice never produces, because it never
 * mixes anything. Only reliable for white and pink (whose own distributions have real room to shift, pink
 * less than white's uniform); irrelevant for the others, which `seamClickDb` above already covers.
 */
function blendKurtosisShift(x: Float32Array, rate: number): number {
  const fade = Math.round(BED_FADE_SECONDS * rate);
  const from = Math.round(fade * 0.4);
  const to = Math.round(fade * 0.6);
  const width = to - from;
  const blend = kurtosis(x.slice(from, to));
  const controls: number[] = [];
  for (let c = fade + width; c + width <= x.length; c += width * 3) controls.push(kurtosis(x.slice(c, c + width)));
  const control = controls.reduce((sum, value) => sum + value, 0) / controls.length;
  return blend - control;
}

describe.each(RATES)('every sound at %i Hz', (rate) => {
  describe.each(SOUNDS.map((sound) => [sound.id, sound] as const))('%s', (_id, sound) => {
    it('is a loop of about the nominal length, finite, below the peak limit, at its loudness target', () => {
      const samples = loop(sound.id, rate);
      expect(Math.abs(samples.length / rate - sound.seconds)).toBeLessThan(0.6);
      expect(samples.every(Number.isFinite)).toBe(true);
      expect(peak(samples)).toBeLessThanOrEqual(0.9);
      const target = sound.id === 'heartbeat' ? HEARTBEAT_TARGET_DB : TARGET_DB;
      expect(Math.abs(toDb(weightedRms(samples, rate)) - target)).toBeLessThanOrEqual(1);
    });

    it('is the same for the same seed and different for another', () => {
      // A short loop is enough to compare, and quick.
      const samples = sound.generate(rate, 3, sound.seed);
      expect(sameSamples(sound.generate(rate, 3, sound.seed), samples)).toBe(true);
      expect(sameSamples(sound.generate(rate, 3, sound.seed + 1), samples)).toBe(false);
    });

    it('has no click at the loop point', () => {
      const samples = loop(sound.id, rate);
      const wrap = Math.abs(samples[0]! - samples[samples.length - 1]!);
      expect(wrap).toBeLessThanOrEqual(stepPercentile(samples, 0.999));
    });
  });

  it('noise beds: exactly `seconds` long, and the loop point is no louder or quieter than the sound itself varies', () => {
    for (const id of ['white', 'pink', 'brown', 'rain', 'wind', 'airplane'] as const) {
      const sound = soundById(id);
      const samples = loop(id, rate);
      const expected = id === 'airplane' ? 2 * Math.round(sound.seconds / 2) * rate : Math.round(sound.seconds * rate);
      expect(samples.length, id).toBe(expected);
      expect(Math.abs(seamDeviation(samples, rate)), id).toBeLessThanOrEqual(Math.max(1, ownVariation(samples, rate)));
    }
  });

  it('a missing crossfade would leave a mark at the loop point that the checks above miss', () => {
    // Every limit below sits strictly between what this sound's own (correctly crossfaded) loop reads and
    // what it reads with `makeLoop`'s blend removed, at both 44.1 kHz and 48 kHz — see the task report for
    // the two sets of readings. `seamClickDb` covers the seven band-limited or naturally rolled-off sounds;
    // white and pink have real energy at every frequency, so `blendKurtosisShift` covers those two instead.
    const clickLimitDb: Record<string, number> = {
      brown: 2,
      rain: -13,
      waves: -10,
      wind: 5,
      heartbeat: 0.5,
      shush: -26,
      airplane: 15,
    };
    for (const [id, limit] of Object.entries(clickLimitDb)) {
      expect(seamClickDb(loop(id as SoundId, rate), rate), id).toBeLessThan(limit);
    }
    for (const id of ['white', 'pink'] as const) {
      expect(blendKurtosisShift(loop(id, rate), rate), id).toBeGreaterThan(0.03);
    }
  });

  it('white is flat, pink tilts down by about 3 dB an octave, brown by more', () => {
    const tilt = (id: SoundId) => {
      const samples = loop(id, rate);
      return bandDb(samples, rate, 4000) - bandDb(samples, rate, 250);
    };
    expect(tilt('white')).toBeGreaterThan(9); // a band 4 octaves up is 16 times wider: +12 dB
    expect(Math.abs(tilt('pink'))).toBeLessThan(4); // −3 dB/octave cancels the wider band
    expect(tilt('brown')).toBeLessThan(-6); // −6 dB/octave, less the +3 dB/octave of the wider band
  });

  it('rain has transients (droplets) that plain pink noise lacks', () => {
    expect(kurtosis(loop('rain', rate))).toBeGreaterThan(kurtosis(loop('pink', rate)) + 1);
  });

  it('heartbeat: whole beats at 70 bpm, the rhythm running on across the loop point', () => {
    const period = periodSamples(60 / HEARTBEAT_BPM, rate);
    const samples = loop('heartbeat', rate);
    expect(samples.length % period).toBe(0);
    const starts = beatStarts(rate, samples.length / period);
    expect(starts.at(-1)! + period).toBe(samples.length);
    // Envelope peaks of the "lub" of every beat: equal intervals, the one across the loop point included.
    const smooth = envelope(samples, rate, 30);
    const dubDelay = Math.round(DUB_DELAY_SECONDS * rate);
    const peaks = starts.map((start) => argmaxAround(smooth, start, start + dubDelay));
    const intervals = peaks.map((at, i) => (i + 1 < peaks.length ? peaks[i + 1]! - at : samples.length - at + peaks[0]!));
    for (const interval of intervals) expect(Math.abs(interval - period) / rate).toBeLessThanOrEqual(0.001);
    expect(60 / (period / rate)).toBeCloseTo(HEARTBEAT_BPM, 0);
    // The window on the loop point matches the same window one beat earlier.
    const width = Math.round(0.2 * rate);
    const seam = rms(windowAround(samples, 0, width));
    expect(Math.abs(toDb(seam / rms(windowAround(samples, -period, width))))).toBeLessThanOrEqual(1);
  });

  it('shush: whole "shh" cycles of 1.4 s, 1 s on and 0.4 s off, on a circle', () => {
    const period = periodSamples(SHUSH_PERIOD_SECONDS, rate);
    const samples = loop('shush', rate);
    expect(samples.length % period).toBe(0);
    const env = shushEnvelope(rate, samples.length / period);
    expect(env.length).toBe(samples.length);
    // Onsets (rising through the middle) come exactly one period apart, across the loop point too.
    const onsets: number[] = [];
    for (let i = 0; i < env.length; i++) {
      const previous = env[(i - 1 + env.length) % env.length]!;
      if (previous < 0.5 && env[i]! >= 0.5) onsets.push(i);
    }
    expect(onsets).toHaveLength(samples.length / period);
    const intervals = onsets.map((at, i) => (i + 1 < onsets.length ? onsets[i + 1]! - at : env.length - at + onsets[0]!));
    for (const interval of intervals) expect(Math.abs(interval - period) / rate).toBeLessThanOrEqual(0.001);
    // On for 1 s of every 1.4 s: above half level from about the middle of the rise (0.06 s) to about the
    // middle of the fall (0.875 s), a little longer as the floor lifts the whole envelope.
    const on = env.filter((value) => value >= 0.5).length / env.length;
    expect(on).toBeGreaterThan(0.55);
    expect(on).toBeLessThan(0.62);
    const width = Math.round(0.2 * rate);
    const seam = rms(windowAround(samples, 0, width));
    expect(Math.abs(toDb(seam / rms(windowAround(samples, -period, width))))).toBeLessThanOrEqual(1);
  });

  it('waves: whole swells of 10 s ± 15%, smooth across the loop point', () => {
    const samples = loop('waves', rate);
    const swell = periodSamples(SWELL_SECONDS, rate);
    expect(samples.length % swell).toBe(0);
    // The loop point falls between two swells, where the envelope is at its floor: the seam window is far
    // quieter than the loop as a whole, so nothing can be heard joining there.
    expect(seamDeviation(samples, rate)).toBeLessThan(-6);
    const env = swellEnvelope(samples.length, rate, mulberry32(5));
    expect(Math.abs(env[0]! - env[env.length - 1]!)).toBeLessThan(1e-6);
    // Each swell starts at exactly 0 (sin² of 0): the starts mark the swells, the loop point among them.
    const starts: number[] = [];
    env.forEach((value, i) => {
      if (value === 0) starts.push(i);
    });
    expect(starts[0]).toBe(0);
    expect(starts).toHaveLength(samples.length / swell);
    const intervals = starts.map((at, i) => (i + 1 < starts.length ? starts[i + 1]! - at : env.length - at));
    for (const interval of intervals) {
      expect(interval / rate).toBeGreaterThanOrEqual(SWELL_SECONDS * 0.85);
      expect(interval / rate).toBeLessThanOrEqual(SWELL_SECONDS * 1.15);
    }
  });
});

describe('catalog', () => {
  it('has one entry per sound id, in tile order, each with its own seed', () => {
    expect(SOUNDS.map((sound) => sound.id)).toEqual([...SOUND_IDS]);
    expect(new Set(SOUNDS.map((sound) => sound.seed)).size).toBe(SOUNDS.length);
  });

  it('noise beds are at least 30 s long, so a repeat is hard to hear', () => {
    for (const id of ['white', 'pink', 'brown'] as const) expect(soundById(id).seconds).toBeGreaterThanOrEqual(30);
  });

  it('crossfades random beds over one second', () => {
    expect(BED_FADE_SECONDS).toBe(1);
  });

  it('generates all nine sounds at 48 kHz in well under a second each (Node; see the plan for the device budget)', () => {
    for (const sound of SOUNDS) {
      const started = performance.now();
      generateSound(sound.id, 48_000);
      expect(performance.now() - started, sound.id).toBeLessThan(1000);
    }
  });
});
