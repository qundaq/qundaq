import { DEFAULT_CAP, MIN_CAP } from '../domain/sounds';

/**
 * Loudness maths. Every slider is 0..1 and becomes a gain through slider² (a perceptual curve), for the
 * layer levels, the master and the cap alike. The UI never shows dB: they would mean nothing without a
 * calibrated speaker.
 */
export { DEFAULT_CAP, MIN_CAP };
/** The master slider when nothing was restored (of the capped range), and a newly enabled layer's level. */
export const DEFAULT_MASTER = 0.6;
export const DEFAULT_LEVEL = 0.7;

/** A slider value in 0..1; anything else (NaN included) becomes the nearest end, or 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function sliderGain(slider: number): number {
  return clamp01(slider) ** 2;
}

/** The cap as the engine uses it: within MIN_CAP..1, the default for anything unreadable. Defence in depth: loadSettings checks it too. */
export function clampCap(cap: unknown): number {
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return DEFAULT_CAP;
  return Math.min(1, Math.max(MIN_CAP, cap));
}

export function capGain(cap: unknown): number {
  return sliderGain(clampCap(cap));
}

/** Above the default, Settings keeps the safety warning in view. */
export function isAboveDefaultCap(cap: number): boolean {
  return clampCap(cap) > DEFAULT_CAP;
}

/**
 * Gain of the layer bus: 1 / max(1, √Σgᵢ²) over the layers' gains. The summed power of the layers is then
 * never above that of one layer at full level, so the cap bounds the loudness whatever the layer count.
 */
export function busScale(levels: readonly number[]): number {
  let power = 0;
  for (const level of levels) power += sliderGain(level) ** 2;
  return 1 / Math.max(1, Math.sqrt(power));
}

/**
 * The master slider after the cap changes. Raising the cap never raises what plays now: the master drops
 * so that master × cap stays the same (and so does master² × cap², the gain); the new headroom is reached
 * only by moving the master slider. Lowering the cap keeps the slider where it is, and the sound gets quieter.
 */
export function masterAfterCapChange(master: number, previousCap: number, nextCap: number): number {
  const from = clampCap(previousCap);
  const to = clampCap(nextCap);
  if (to <= from) return clamp01(master);
  return clamp01((clamp01(master) * from) / to);
}

/** "70%" for a slider's aria-valuetext. */
export function percent(slider: number): string {
  return `${Math.round(clamp01(slider) * 100)}%`;
}
