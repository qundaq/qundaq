/** Samples at or below this (about −50 dBFS) count as silence at the ends of a decoded file. */
export const SILENCE_THRESHOLD = 10 ** (-50 / 20);

/** Seconds of a file's tail blended into its head, so the loop's seam never clicks. */
export const CROSSFADE_SECONDS = 0.25;

/**
 * The range of `samples` between the first and the last sample above the threshold: AAC encoders pad the
 * start of a file with a little silence, and recordings often carry room tone. An entirely silent input
 * is kept whole (there is nothing to cut to).
 */
export function trimSilence(
  samples: Float32Array,
  threshold = SILENCE_THRESHOLD,
): { start: number; end: number } {
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]!) <= threshold) start++;
  if (start === samples.length) return { start: 0, end: samples.length };
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]!) <= threshold) end--;
  return { start, end };
}

/**
 * A loop with no seam: the last `fadeLength` samples are blended (equal power) into the first
 * `fadeLength` and then dropped, so the sample after the loop's end is the one that followed it in the
 * file. Looping the result natively is gapless and click-free whatever the file's own start and end
 * look like. Too short a file (the fade must stay under a quarter of it) comes back unchanged.
 */
export function crossfadeLoop(samples: Float32Array, fadeLength: number): Float32Array {
  const fade = Math.floor(fadeLength);
  if (fade <= 0 || samples.length < fade * 4) return samples.slice();
  const length = samples.length - fade;
  const out = samples.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const angle = ((i + 0.5) / fade) * (Math.PI / 2);
    out[i] = samples[i]! * Math.sin(angle) + samples[length + i]! * Math.cos(angle);
  }
  return out;
}
