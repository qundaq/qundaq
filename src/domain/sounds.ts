/**
 * The sounds this version can play, by id, in tile order. A stored selection may name others (from
 * another version): they read back as nothing selected.
 */
export const SOUND_IDS = ['white', 'airplane', 'train', 'waves'] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === 'string' && (SOUND_IDS as readonly string[]).includes(value);
}

/** A saved mix's layer limit: still read from backups and old rows (src/backup/validate.ts, src/db/mixes.ts); nothing plays layers any more. */
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

/** Settings → volume safety cap (settings.cap.title): the cap's range and default, as slider values (the gain is the square). */
export const MIN_CAP = 0.2;
export const DEFAULT_CAP = 0.5;

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * The stored cap, or the default: a value that decides loudness is never trusted from storage (a
 * stored 5 would be a gain of 25).
 */
export function readVolumeCap(value: unknown): number {
  return isUnit(value) && value >= MIN_CAP ? value : DEFAULT_CAP;
}

/** What the sounds tab remembers between launches: the selection, never the playing state. */
export interface LastSound {
  /** null: nothing selected. */
  soundId: SoundId | null;
  master: number;
  timerMin: TimerChoice;
}

/**
 * The stored last selection, checked field by field: a master in 0..1 and a timer chip, or it is dropped
 * whole (undefined). A sound id this version does not know — including the old multi-layer shape, which
 * has none — reads back as nothing selected, so the master and the chip survive an upgrade.
 */
export function readLastSound(value: unknown): LastSound | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!isUnit(record.master) || !isTimerChoice(record.timerMin)) return undefined;
  return {
    soundId: isSoundId(record.soundId) ? record.soundId : null,
    master: record.master,
    timerMin: record.timerMin,
  };
}

/** The layers a mix may be saved with: 1–MAX_LAYERS unique sound ids (any version's, 1–40 characters) with finite gains in 0..1. */
export function validMixLayers(layers: readonly { soundId: string; gain: number }[]): boolean {
  if (layers.length === 0 || layers.length > MAX_LAYERS) return false;
  const seen = new Set<string>();
  for (const layer of layers) {
    if (
      typeof layer.soundId !== 'string' ||
      layer.soundId.length === 0 ||
      layer.soundId.length > 40 ||
      !isUnit(layer.gain) ||
      seen.has(layer.soundId)
    )
      return false;
    seen.add(layer.soundId);
  }
  return true;
}
