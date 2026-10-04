import type { MessageKey } from '../i18n';
import type { SoundId } from '../domain/sounds';

/** The format of every bundled recording; the one place to change if the files end up as mp3. */
export const SOUND_EXTENSION = 'm4a';

/** One tile of the sounds tab. Every sound is a bundled recording (public/sounds/SOURCES.md). */
export interface Sound {
  id: SoundId;
  nameKey: MessageKey;
}

export const SOUNDS: readonly Sound[] = [
  { id: 'white', nameKey: 'sound.white' },
  { id: 'airplane', nameKey: 'sound.airplane' },
  { id: 'train', nameKey: 'sound.train' },
  { id: 'waves', nameKey: 'sound.waves' },
];

export function soundById(id: SoundId): Sound {
  const sound = SOUNDS.find((entry) => entry.id === id);
  if (!sound) throw new Error(`Unknown sound ${id}`);
  return sound;
}

/** Relative on purpose: Vite's base is './' and the app lives under a sub-path on GitHub Pages. */
export function soundUrl(id: SoundId): string {
  return `sounds/${id}.${SOUND_EXTENSION}`;
}
