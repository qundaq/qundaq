import type { MessageKey } from '../i18n';
import type { SoundId } from '../domain/sounds';
import { airplane, brown, heartbeat, pink, rain, shush, waves, white, wind, type Generator } from './generators';

/**
 * Every sound the Sesler tab offers, in tile order. All are generated in code (see
 * public/sounds/SOURCES.md): nothing is downloaded and no recording ships in this version.
 */
export interface Sound {
  id: SoundId;
  nameKey: MessageKey;
  /** Nominal loop length; rhythmic sounds round it to whole periods. */
  seconds: number;
  generate: Generator;
  /** Fixed, so a sound is the same on every phone and after every restart. */
  seed: number;
}

export const SOUNDS: readonly Sound[] = [
  { id: 'white', nameKey: 'sound.white', seconds: 30, generate: white, seed: 1 },
  { id: 'pink', nameKey: 'sound.pink', seconds: 30, generate: pink, seed: 2 },
  { id: 'brown', nameKey: 'sound.brown', seconds: 30, generate: brown, seed: 3 },
  { id: 'rain', nameKey: 'sound.rain', seconds: 20, generate: rain, seed: 4 },
  { id: 'waves', nameKey: 'sound.waves', seconds: 30, generate: waves, seed: 5 },
  { id: 'wind', nameKey: 'sound.wind', seconds: 24, generate: wind, seed: 6 },
  { id: 'heartbeat', nameKey: 'sound.heartbeat', seconds: 12, generate: heartbeat, seed: 7 },
  { id: 'shush', nameKey: 'sound.shush', seconds: 14, generate: shush, seed: 8 },
  { id: 'airplane', nameKey: 'sound.airplane', seconds: 16, generate: airplane, seed: 9 },
];

export function soundById(id: SoundId): Sound {
  const sound = SOUNDS.find((entry) => entry.id === id);
  if (!sound) throw new Error(`Unknown sound ${id}`);
  return sound;
}

/** The samples of one sound's loop at this rate. */
export function generateSound(id: SoundId, sampleRate: number): Float32Array {
  const sound = soundById(id);
  return sound.generate(sampleRate, sound.seconds, sound.seed);
}
