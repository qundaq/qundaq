/** The sounds this version can play, by id. A stored mix may name others (from a newer version): they are skipped. */
export const SOUND_IDS = [
  'white',
  'pink',
  'brown',
  'rain',
  'waves',
  'wind',
  'heartbeat',
  'shush',
  'airplane',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === 'string' && (SOUND_IDS as readonly string[]).includes(value);
}

/** Layers that play at once: the Sesler tiles, a saved mix, the last selection and a backup's mixes. */
export const MAX_LAYERS = 6;

/** The sleep timer's chips: 15, 30 or 60 minutes, or ∞ (null: no timer). */
export const TIMER_MINUTES = [15, 30, 60] as const;
export type TimerMinutes = (typeof TIMER_MINUTES)[number];
export type TimerChoice = TimerMinutes | null;
export const TIMER_CHOICES: readonly TimerChoice[] = [...TIMER_MINUTES, null];
/** Selected until the parent picks another: "not continuously" is the advice. */
export const DEFAULT_TIMER: TimerChoice = 60;

export function isTimerChoice(value: unknown): value is TimerChoice {
  return value === null || (TIMER_MINUTES as readonly unknown[]).includes(value);
}

/** Ayarlar → Ses güvenlik sınırı: the cap's range and default, as slider values (the gain is the square). */
export const MIN_CAP = 0.2;
export const DEFAULT_CAP = 0.5;

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * The stored cap as the app may use it: a finite number within MIN_CAP..1, otherwise the default. A
 * value that decides loudness is never trusted from storage (a stored 5 would be a gain of 25).
 */
export function readVolumeCap(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_CAP && value <= 1
    ? value
    : DEFAULT_CAP;
}

/** What the Sesler tab remembers between launches: the selection, never the playing state. */
export interface LastSound {
  layers: { soundId: SoundId; level: number }[];
  master: number;
  timerMin: TimerChoice;
}

/**
 * The stored last selection, checked field by field: at most MAX_LAYERS known, unique sound ids with
 * levels in 0..1, a master in 0..1 and a timer chip. Anything else is dropped whole (undefined).
 */
export function readLastSound(value: unknown): LastSound | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const layers = record.layers;
  if (
    !Array.isArray(layers) ||
    layers.length > MAX_LAYERS ||
    !isUnit(record.master) ||
    !isTimerChoice(record.timerMin)
  )
    return undefined;
  const out: LastSound['layers'] = [];
  for (const layer of layers) {
    if (typeof layer !== 'object' || layer === null) return undefined;
    const { soundId, level } = layer as Record<string, unknown>;
    if (!isSoundId(soundId) || !isUnit(level) || out.some((other) => other.soundId === soundId))
      return undefined;
    out.push({ soundId, level });
  }
  return { layers: out, master: record.master, timerMin: record.timerMin };
}

/** The layers a mix may be saved with: 1–MAX_LAYERS known, unique sound ids with finite gains in 0..1. */
export function validMixLayers(layers: readonly { soundId: string; gain: number }[]): boolean {
  if (layers.length === 0 || layers.length > MAX_LAYERS) return false;
  const seen = new Set<string>();
  for (const layer of layers) {
    if (!isSoundId(layer.soundId) || !isUnit(layer.gain) || seen.has(layer.soundId)) return false;
    seen.add(layer.soundId);
  }
  return true;
}
