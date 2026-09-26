import { soundById } from '../../audio/catalog';
import type { EngineState, SavedSound } from '../../audio/engine';
import { minutesLeft } from '../../audio/timer';
import { DEFAULT_MASTER, masterAfterCapChange } from '../../audio/volume';
import { DEFAULT_TIMER, isSoundId, type LastSound, type SoundId } from '../../domain/sounds';
import type { Settings } from '../../db/settings';
import type { MixLayer } from '../../domain/types';
import type { TranslateFn } from '../I18nProvider';

/** "Beyaz gürültü + Yağmur", in layer order. */
export function layerNames(t: TranslateFn, layers: readonly { soundId: SoundId }[]): string {
  return layers.map((layer) => t(soundById(layer.soundId).nameKey)).join(' + ');
}

/** A saved mix's sounds as this version knows them; "(bilinmeyen ses)" when it knows none of them (R7). */
export function mixLayerNames(t: TranslateFn, layers: readonly MixLayer[]): string {
  const known = layers.filter((layer): layer is MixLayer & { soundId: SoundId } => isSoundId(layer.soundId));
  return known.length === 0 ? t('sounds.mix.unknown') : layerNames(t, known);
}

/** "Çalıyor · Beyaz gürültü + Yağmur", "Duraklatıldı", "Durdu" or "Ses kesildi" (R14). */
export function statusText(t: TranslateFn, state: Pick<EngineState, 'status' | 'layers'>): string {
  if (state.status === 'playing') return t('sounds.status.playing', { names: layerNames(t, state.layers) });
  return t(`sounds.status.${state.status}`);
}

/** "24 dk kaldı" while a timer counts down, otherwise null. */
export function remainingText(t: TranslateFn, endsAt: number | null, now: number): string | null {
  return endsAt === null ? null : t('sounds.remaining', { m: minutesLeft(endsAt, now) });
}

/** What the app remembers of the Sesler tab: the selection, the master slider and the chip; never the playing state. */
export function lastSoundOf(state: Pick<EngineState, 'layers' | 'master' | 'timer'>): LastSound {
  return { layers: state.layers.map((layer) => ({ soundId: layer.soundId, level: layer.level })), master: state.master, timerMin: state.timer };
}

export function toSavedSound(last: LastSound): SavedSound {
  return { layers: last.layers, master: last.master, timer: last.timerMin };
}

/**
 * A settings patch that carries a new cap together with the selection as the engine will have it once the
 * cap applies (the master lowered when the cap rises, R1), so that one write stores both: a launch after a
 * kill in the next second must not restore the old master under the new cap. Other patches pass through.
 */
export function withCapRescale(patch: Partial<Settings>, state: Pick<EngineState, 'layers' | 'master' | 'timer'>, previousCap: number): Partial<Settings> {
  if (patch.volumeCap === undefined) return patch;
  const master = masterAfterCapChange(state.master, previousCap, patch.volumeCap);
  return { ...patch, lastSound: { ...lastSoundOf(state), master } };
}

const NOTHING: LastSound = { layers: [], master: DEFAULT_MASTER, timerMin: DEFAULT_TIMER };

/** Equal selections; a stored `undefined` counts as the default selection, so a fresh app writes nothing. */
export function sameLastSound(a: LastSound, b: LastSound | undefined): boolean {
  const other = b ?? NOTHING;
  return (
    a.master === other.master &&
    a.timerMin === other.timerMin &&
    a.layers.length === other.layers.length &&
    a.layers.every((layer, i) => layer.soundId === other.layers[i]!.soundId && layer.level === other.layers[i]!.level)
  );
}
