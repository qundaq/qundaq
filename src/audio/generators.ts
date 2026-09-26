import {
  addCircular,
  bandPass,
  filter,
  highPass,
  lowPass,
  makeLoop,
  normalise,
  onePoleHighPass,
  onePoleLowPass,
  periodSamples,
} from './dsp';
import { mulberry32, whiteNoise } from './random';

/**
 * One pure function per procedural sound: (sampleRate, seconds, seed) → a mono loop that plays seamlessly
 * with `loop = true`. Random beds are crossfaded tail-into-head (makeLoop). Rhythmic parts (beats, "shh",
 * swells) are placed on a circle instead: their period is a whole number of samples at this rate and the
 * loop holds whole periods, so the rhythm runs on across the loop point. Every sound is normalised to a
 * weighted RMS (dsp.weightedRms), so the sliders and the cap mean the same for all of them.
 */
export type Generator = (sampleRate: number, seconds: number, seed: number) => Float32Array;

/** Weighted RMS the sounds are normalised to, in dBFS. */
export const TARGET_DB = -20;
/** The heartbeat is a thump with silence between the beats; normalised lower so its peaks stay clean. */
export const HEARTBEAT_TARGET_DB = -24;
/** Crossfade of a random bed at its loop point. */
export const BED_FADE_SECONDS = 1;

/** A random bed of exactly `length` samples that loops seamlessly (`make` gets the crossfade on top). */
function bedLoop(
  sampleRate: number,
  length: number,
  make: (length: number) => Float32Array,
): Float32Array {
  const fade = Math.round(BED_FADE_SECONDS * sampleRate);
  return makeLoop(make(length + fade), sampleRate, BED_FADE_SECONDS);
}

/** Paul Kellet's "refined" pink filter (published on music-dsp without restrictions): −3 dB per octave. */
export function pinkNoise(length: number, random: () => number): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return out;
}

/** Brown (red) noise: a leaky integrator of white noise, with its DC removed. −6 dB per octave. */
export function brownNoise(length: number, random: () => number, sampleRate: number): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return onePoleHighPass(out, sampleRate, 20);
}

function loopLength(sampleRate: number, seconds: number): number {
  return Math.round(seconds * sampleRate);
}

export const white: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  return normalise(
    bedLoop(sampleRate, loopLength(sampleRate, seconds), (n) => whiteNoise(n, random)),
    sampleRate,
    TARGET_DB,
  );
};

export const pink: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  return normalise(
    bedLoop(sampleRate, loopLength(sampleRate, seconds), (n) => pinkNoise(n, random)),
    sampleRate,
    TARGET_DB,
  );
};

export const brown: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  return normalise(
    bedLoop(sampleRate, loopLength(sampleRate, seconds), (n) => brownNoise(n, random, sampleRate)),
    sampleRate,
    TARGET_DB,
  );
};

/** A band-limited pink bed with sparse droplets: short decaying bursts of bright noise at random levels. */
export const rain: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const bed = bedLoop(sampleRate, loopLength(sampleRate, seconds), (n) => {
    const out = filter(
      filter(pinkNoise(n, random), highPass(sampleRate, 400)),
      lowPass(sampleRate, 9000),
    );
    const drops = Math.round((n / sampleRate) * 150); // about 150 droplets a second
    for (let d = 0; d < drops; d++) {
      const start = Math.floor(random() * n);
      const decay = (0.001 + random() * 0.005) * sampleRate;
      const level = 0.05 + 0.4 * random() ** 2; // many soft drops, a few loud ones
      const length = Math.min(n - start, Math.round(decay * 5));
      let previous = 0;
      for (let i = 0; i < length; i++) {
        const noise = random() * 2 - 1;
        // The first difference tilts the burst towards the highs: a tick, not a thud.
        out[start + i] = out[start + i]! + (noise - previous) * level * Math.exp(-i / decay);
        previous = noise;
      }
    }
    return out;
  });
  return normalise(bed, sampleRate, TARGET_DB);
};

/** Mean length of one swell of `waves`, in seconds. */
export const SWELL_SECONDS = 10;

/**
 * The swell envelope of `waves` on a circle of `length` samples: whole swells that add up to the loop
 * exactly, their lengths drawn within ±10% and then scaled to fit, so each stays within ±15% of
 * SWELL_SECONDS. Each swell is sin², 0 at both ends, so the envelope is smooth everywhere, the loop point
 * included.
 */
export function swellEnvelope(
  length: number,
  sampleRate: number,
  random: () => number,
): Float32Array {
  const count = Math.max(1, Math.round(length / (SWELL_SECONDS * sampleRate)));
  const weights = Array.from({ length: count }, () => 1 + 0.1 * (random() * 2 - 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const envelope = new Float32Array(length);
  let start = 0;
  weights.forEach((weight, index) => {
    const end = index === count - 1 ? length : start + Math.round((weight / total) * length);
    const size = end - start;
    for (let i = 0; i < size; i++) envelope[start + i] = Math.sin((Math.PI * i) / size) ** 2;
    start = end;
  });
  return envelope;
}

/** Brown noise under a slow swell, brighter at the top of each swell: a darker and a brighter bed mixed by the envelope. */
export const waves: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const swells = Math.max(1, Math.round(seconds / SWELL_SECONDS));
  const length = swells * periodSamples(SWELL_SECONDS, sampleRate);
  const raw = brownNoise(length + Math.round(BED_FADE_SECONDS * sampleRate), random, sampleRate);
  const dark = makeLoop(onePoleLowPass(raw, sampleRate, 350), sampleRate, BED_FADE_SECONDS);
  const bright = makeLoop(onePoleLowPass(raw, sampleRate, 1600), sampleRate, BED_FADE_SECONDS);
  const envelope = swellEnvelope(length, sampleRate, random);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const e = envelope[i]!;
    out[i] = (0.2 + 0.8 * e) * (dark[i]! * (1 - e) + bright[i]! * e * 1.6);
  }
  return normalise(out, sampleRate, TARGET_DB);
};

/**
 * A smooth random curve on a circle of `length` samples: a few low harmonics with random phases, so it
 * drifts slowly and joins itself at the loop point. Values stay within [low, high]. Computed every 64
 * samples and interpolated in between: the curve changes over seconds, not samples.
 */
function driftCurve(length: number, random: () => number, low: number, high: number): Float32Array {
  const harmonics = [1, 2, 3, 4].map((h) => ({
    h,
    amplitude: random() / h,
    phase: random() * 2 * Math.PI,
  }));
  const reach = harmonics.reduce((sum, { amplitude }) => sum + amplitude, 0);
  const at = (i: number) => {
    let value = 0;
    for (const { h, amplitude, phase } of harmonics)
      value += amplitude * Math.sin((2 * Math.PI * h * i) / length + phase);
    return low + ((value / reach + 1) / 2) * (high - low);
  };
  const step = 64;
  const curve = new Float32Array(length);
  for (let start = 0; start < length; start += step) {
    const end = Math.min(length, start + step);
    const from = at(start);
    const to = at(end); // at(length) equals at(0): the curve is periodic
    for (let i = start; i < end; i++) curve[i] = from + ((to - from) * (i - start)) / (end - start);
  }
  return curve;
}

/** Pink noise through three band-passes whose levels drift independently: the centre of the wind wanders. */
export const wind: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const length = loopLength(sampleRate, seconds);
  const raw = pinkNoise(length + Math.round(BED_FADE_SECONDS * sampleRate), random);
  const out = new Float32Array(length);
  for (const centre of [300, 600, 1200]) {
    const band = makeLoop(
      filter(raw, bandPass(sampleRate, centre, 1.2)),
      sampleRate,
      BED_FADE_SECONDS,
    );
    const gain = driftCurve(length, random, 0.1, 1);
    for (let i = 0; i < length; i++) out[i] = out[i]! + band[i]! * gain[i]! ** 2;
  }
  return normalise(out, sampleRate, TARGET_DB);
};

/** Beats per minute of `heartbeat`, and the gap from "lub" to "dub". */
export const HEARTBEAT_BPM = 70;
export const DUB_DELAY_SECONDS = 0.28;

/**
 * One thump a phone speaker can play: a fundamental gliding from `fromHz` to `toHz` (60–90 Hz) with
 * harmonics up to about 300 Hz, a 4 ms attack and a 45 ms decay.
 */
function thump(sampleRate: number, fromHz: number, toHz: number): Float32Array {
  const length = Math.round(0.25 * sampleRate);
  const out = new Float32Array(length);
  const amplitudes = [1, 0.7, 0.45, 0.25];
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const freq = toHz + (fromHz - toHz) * Math.exp(-t / 0.04);
    phase += (2 * Math.PI * freq) / sampleRate;
    const envelope = Math.min(1, t / 0.004) * Math.exp(-t / 0.045);
    let value = 0;
    amplitudes.forEach((amplitude, h) => {
      value += amplitude * Math.sin((h + 1) * phase);
    });
    out[i] = value * envelope;
  }
  return out;
}

/** Where each beat of `heartbeat` starts, in samples, on a loop of `beats` whole periods. */
export function beatStarts(sampleRate: number, beats: number): number[] {
  const period = periodSamples(60 / HEARTBEAT_BPM, sampleRate);
  return Array.from({ length: beats }, (_, i) => i * period);
}

/** "Lub-dub" pairs at 70 bpm over a very quiet brown bed. The loop holds whole beats (≈ `seconds`). */
export const heartbeat: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const period = periodSamples(60 / HEARTBEAT_BPM, sampleRate);
  const beats = Math.max(1, Math.round((seconds * sampleRate) / period));
  const length = beats * period;
  const out = bedLoop(sampleRate, length, (n) => brownNoise(n, random, sampleRate));
  for (let i = 0; i < length; i++) out[i] = out[i]! * 0.02;
  const lub = thump(sampleRate, 90, 60);
  const dub = thump(sampleRate, 80, 55);
  const dubDelay = Math.round(DUB_DELAY_SECONDS * sampleRate);
  for (const start of beatStarts(sampleRate, beats)) {
    addCircular(out, lub, start);
    addCircular(out, dub, start + dubDelay, 0.7);
  }
  return normalise(out, sampleRate, HEARTBEAT_TARGET_DB);
};

/** One "shh" cycle of `shush`: 1 s on, 0.4 s off. */
export const SHUSH_PERIOD_SECONDS = 1.4;

/**
 * The "shh" envelope on a circle of `periods` whole cycles: each cycle rises over 0.12 s, holds, and falls
 * over 0.25 s within its first second, then rests at a low floor for 0.4 s. Raised-cosine edges.
 */
export function shushEnvelope(sampleRate: number, periods: number): Float32Array {
  const period = periodSamples(SHUSH_PERIOD_SECONDS, sampleRate);
  const rise = Math.round(0.12 * sampleRate);
  const fall = Math.round(0.25 * sampleRate);
  const on = Math.round(1 * sampleRate);
  const floor = 0.06;
  const cycle = new Float32Array(period);
  for (let i = 0; i < period; i++) {
    let level = 0;
    if (i < rise) level = (1 - Math.cos((Math.PI * i) / rise)) / 2;
    else if (i < on - fall) level = 1;
    else if (i < on) level = (1 + Math.cos((Math.PI * (i - (on - fall))) / fall)) / 2;
    cycle[i] = floor + (1 - floor) * level;
  }
  const envelope = new Float32Array(period * periods);
  for (let p = 0; p < periods; p++) envelope.set(cycle, p * period);
  return envelope;
}

/** High-passed pink noise shaped by the rhythmic "shh" envelope. The loop holds whole cycles (≈ `seconds`). */
export const shush: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const period = periodSamples(SHUSH_PERIOD_SECONDS, sampleRate);
  const periods = Math.max(1, Math.round((seconds * sampleRate) / period));
  const envelope = shushEnvelope(sampleRate, periods);
  const bed = bedLoop(sampleRate, envelope.length, (n) =>
    filter(filter(pinkNoise(n, random), highPass(sampleRate, 1200)), lowPass(sampleRate, 6500)),
  );
  for (let i = 0; i < bed.length; i++) bed[i] = bed[i]! * envelope[i]!;
  return normalise(bed, sampleRate, TARGET_DB);
};

/** Frequencies of the cabin hum: two close tones beat slowly (0.5 Hz), with their octaves. */
export const HUM_HZ = [110, 110.5, 220, 221] as const;

/**
 * A low, even roar (brown and pink noise, low-passed) with a faint beating hum. The loop is `seconds`
 * rounded to whole seconds, times two: every hum frequency then makes whole cycles and joins itself.
 */
export const airplane: Generator = (sampleRate, seconds, seed) => {
  const random = mulberry32(seed);
  const length = Math.max(2, 2 * Math.round(seconds / 2)) * sampleRate;
  const out = bedLoop(sampleRate, length, (n) => {
    const brownBed = brownNoise(n, random, sampleRate);
    const pinkBed = pinkNoise(n, random);
    const mix = new Float32Array(n);
    for (let i = 0; i < n; i++) mix[i] = brownBed[i]! * 0.8 + pinkBed[i]! * 0.35;
    return filter(mix, lowPass(sampleRate, 700));
  });
  const humLevels = [0.03, 0.03, 0.02, 0.02];
  for (let i = 0; i < length; i++) {
    let hum = 0;
    HUM_HZ.forEach((freq, k) => {
      hum += humLevels[k]! * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    });
    out[i] = out[i]! + hum;
  }
  return normalise(out, sampleRate, TARGET_DB);
};
