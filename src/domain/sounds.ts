/** The sounds this version can play, by id. A stored mix may name others (from a newer version): they are skipped. */
export const SOUND_IDS = ['white', 'pink', 'brown', 'rain', 'waves', 'wind', 'heartbeat', 'shush', 'airplane'] as const;

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
