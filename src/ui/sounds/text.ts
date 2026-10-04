import { soundById } from '../../audio/catalog';
import type { EngineState, SavedSound } from '../../audio/engine';
import { minutesLeft } from '../../audio/timer';
import { DEFAULT_MASTER } from '../../audio/volume';
import { DEFAULT_TIMER, type LastSound, type SoundId } from '../../domain/sounds';
import type { TranslateFn } from '../app/I18nProvider';

/** The sound's name ("White noise"); empty while nothing is selected. */
export function soundName(t: TranslateFn, soundId: SoundId | null): string {
  return soundId === null ? '' : t(soundById(soundId).nameKey);
}

/** sounds.status.playing ("Playing · White noise"), .paused, .stopped or .interrupted (R14). */
export function statusText(t: TranslateFn, state: Pick<EngineState, 'status' | 'current'>): string {
  if (state.status === 'playing')
    return t('sounds.status.playing', { name: soundName(t, state.current) });
  return t(`sounds.status.${state.status}`);
}

/** sounds.remaining ("24 minutes left") while a timer counts down, otherwise null. */
export function remainingText(t: TranslateFn, endsAt: number | null, now: number): string | null {
  return endsAt === null ? null : t('sounds.remaining', { m: minutesLeft(endsAt, now) });
}

/** What the app remembers of the Sounds tab: the selection, the master slider and the chip; never the playing state. */
export function lastSoundOf(state: Pick<EngineState, 'current' | 'master' | 'timer'>): LastSound {
  return { soundId: state.current, master: state.master, timerMin: state.timer };
}

export function toSavedSound(last: LastSound): SavedSound {
  return { soundId: last.soundId, master: last.master, timer: last.timerMin };
}

/**
 * What the persist timer writes when it fires: the selection as the engine holds it then, or null when
 * storage already has it. Never a render's copy: that can predate a cap raise's rescale (the old, louder
 * master under the new cap) or the launch's restore (the default selection over the stored one).
 */
export function lastSoundToPersist(
  snapshot: Pick<EngineState, 'current' | 'master' | 'timer'>,
  stored: LastSound | undefined,
): LastSound | null {
  const next = lastSoundOf(snapshot);
  return sameLastSound(next, stored) ? null : next;
}

const NOTHING: LastSound = { soundId: null, master: DEFAULT_MASTER, timerMin: DEFAULT_TIMER };

/** Equal selections; a stored `undefined` counts as the default selection, so a fresh app writes nothing. */
export function sameLastSound(a: LastSound, b: LastSound | undefined): boolean {
  const other = b ?? NOTHING;
  return a.soundId === other.soundId && a.master === other.master && a.timerMin === other.timerMin;
}
