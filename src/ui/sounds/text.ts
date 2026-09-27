import { soundById } from '../../audio/catalog';
import type { EngineState, SavedSound } from '../../audio/engine';
import { minutesLeft } from '../../audio/timer';
import { DEFAULT_MASTER } from '../../audio/volume';
import { DEFAULT_TIMER, isSoundId, type LastSound, type SoundId } from '../../domain/sounds';
import type { MixLayer } from '../../domain/types';
import type { TranslateFn } from '../app/I18nProvider';

/** sound.white + sound.rain ("White noise + Rain"), in layer order. */
export function layerNames(t: TranslateFn, layers: readonly { soundId: SoundId }[]): string {
  return layers.map((layer) => t(soundById(layer.soundId).nameKey)).join(' + ');
}

/** A saved mix's sounds as this version knows them; sounds.mix.unknown ("(unknown sound)") when it knows none of them (R7). */
export function mixLayerNames(t: TranslateFn, layers: readonly MixLayer[]): string {
  const known = layers.filter((layer): layer is MixLayer & { soundId: SoundId } =>
    isSoundId(layer.soundId),
  );
  return known.length === 0 ? t('sounds.mix.unknown') : layerNames(t, known);
}

/** sounds.status.playing ("Playing · White noise + Rain"), .paused, .stopped or .interrupted (R14). */
export function statusText(t: TranslateFn, state: Pick<EngineState, 'status' | 'layers'>): string {
  if (state.status === 'playing')
    return t('sounds.status.playing', { names: layerNames(t, state.layers) });
  return t(`sounds.status.${state.status}`);
}

/** sounds.remaining ("24 minutes left") while a timer counts down, otherwise null. */
export function remainingText(t: TranslateFn, endsAt: number | null, now: number): string | null {
  return endsAt === null ? null : t('sounds.remaining', { m: minutesLeft(endsAt, now) });
}

/** What the app remembers of the Sounds tab: the selection, the master slider and the chip; never the playing state. */
export function lastSoundOf(state: Pick<EngineState, 'layers' | 'master' | 'timer'>): LastSound {
  return {
    layers: state.layers.map((layer) => ({ soundId: layer.soundId, level: layer.level })),
    master: state.master,
    timerMin: state.timer,
  };
}

export function toSavedSound(last: LastSound): SavedSound {
  return { layers: last.layers, master: last.master, timer: last.timerMin };
}

/**
 * What the persist timer writes when it fires: the selection as the engine holds it then, or null when
 * storage already has it. Never a render's copy: that can predate a cap raise's rescale (the old, louder
 * master under the new cap) or the launch's restore (the default selection over the stored one).
 */
export function lastSoundToPersist(
  snapshot: Pick<EngineState, 'layers' | 'master' | 'timer'>,
  stored: LastSound | undefined,
): LastSound | null {
  const next = lastSoundOf(snapshot);
  return sameLastSound(next, stored) ? null : next;
}

const NOTHING: LastSound = { layers: [], master: DEFAULT_MASTER, timerMin: DEFAULT_TIMER };

/** Equal selections; a stored `undefined` counts as the default selection, so a fresh app writes nothing. */
export function sameLastSound(a: LastSound, b: LastSound | undefined): boolean {
  const other = b ?? NOTHING;
  return (
    a.master === other.master &&
    a.timerMin === other.timerMin &&
    a.layers.length === other.layers.length &&
    a.layers.every(
      (layer, i) =>
        layer.soundId === other.layers[i]!.soundId && layer.level === other.layers[i]!.level,
    )
  );
}
