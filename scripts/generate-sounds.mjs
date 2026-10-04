// Usage: node scripts/generate-sounds.mjs <dir>, then afconvert <name>.wav <name>.m4a -f m4af -d aac -b 96000
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 44100;
const SECONDS = 45;
const N = SR * SECONDS;

// Seeded PRNG (LCG), one per sound, so every run gives the same samples in any order.
const makeRng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// One-pole low-pass filter.
const lp = (x, fc) => {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
};
const hp = (x, fc) => {
  const low = lp(x, fc);
  return x.map((v, i) => v - low[i]);
};

const white = (rnd) => Float32Array.from({ length: N }, rnd);

// Brown noise: leaky integration of white noise, then a 20 Hz high-pass.
const brown = (rnd) => {
  const w = white(rnd);
  const out = new Float32Array(N);
  let y = 0;
  for (let i = 0; i < N; i++) {
    y = (y + 0.02 * w[i]) / 1.0005;
    out[i] = y;
  }
  return hp(out, 20);
};

// Pink noise: three-pole approximation of a -3 dB per octave slope.
const pink = (rnd) => {
  const w = white(rnd);
  const out = new Float32Array(N);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < N; i++) {
    b0 = 0.99765 * b0 + w[i] * 0.099046;
    b1 = 0.963 * b1 + w[i] * 0.2965164;
    b2 = 0.57 * b2 + w[i] * 1.0526913;
    out[i] = b0 + b1 + b2 + w[i] * 0.1848;
  }
  return out;
};

// A slow sine gain with a whole number of cycles in the loop, so the loop seam stays clean.
const slow = (f, depth) => {
  const ff = Math.max(1, Math.round(f * SECONDS)) / SECONDS;
  return Float32Array.from(
    { length: N },
    (_, i) => 1 + depth * Math.sin((2 * Math.PI * ff * i) / SR),
  );
};

const mix = (...parts) => {
  const out = new Float32Array(N);
  for (const p of parts) for (let i = 0; i < N; i++) out[i] += p[i];
  return out;
};
const scale = (x, g) => x.map((v) => v * g);
const mul = (a, b) => a.map((v, i) => v * b[i]);
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

// Two cascaded one-pole high-passes (12 dB per octave).
const hp2 = (x, fc) => hp(hp(x, fc), fc);

// Scale to -20 dBFS RMS (measured above 120 Hz, as a phone speaker plays it), soft-limit with tanh, write a 16-bit mono WAV.
function finish(x, path) {
  const gain = 0.1 / rms(hp2(x, 120));
  const y = x.map((v) => Math.tanh(v * gain));
  const buf = Buffer.alloc(44 + N * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 2, 40);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    peak = Math.max(peak, Math.abs(y[i]));
    buf.writeInt16LE(Math.round(y[i] * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
  console.log(path, 'rms', rms(y).toFixed(4), 'peak', peak.toFixed(3));
}

const dir = process.argv[2] ?? '.';
mkdirSync(dir, { recursive: true });

// White: pink-leaning noise low-passed at 6 kHz over a faint low bed near 150 Hz, nothing below about 90 Hz.
const whiteRng = makeRng(12345);
finish(
  hp2(mix(lp(pink(whiteRng), 6000), scale(lp(brown(whiteRng), 150), 3)), 90),
  join(dir, 'white.wav'),
);

// Airplane: only shaped noise, a deep turbulent drone from about 90 Hz up (24 dB per octave) with a very slow breathing.
const airRng = makeRng(67890);
const bed = mix(scale(lp(brown(airRng), 500), 7), scale(lp(lp(pink(airRng), 1200), 1500), 0.4));
finish(mul(hp2(hp2(bed, 90), 90), slow(0.09, 0.04)), join(dir, 'airplane.wav'));
