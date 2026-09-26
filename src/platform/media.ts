/**
 * The iOS audio session and the Media Session, behind the shapes the app needs. Both are optional in
 * the browser: absent APIs are no-ops. `navigator.audioSession` is WebKit's and not in the TypeScript
 * DOM types, so its shape is declared here.
 */
export interface AudioSessionLike {
  /** 'auto' by default; 'playback' plays through the ring/silent switch and counts as media. */
  type: string;
  /** 'active' | 'interrupted' | 'inactive' (compared as strings). */
  readonly state?: string;
  onstatechange?: ((event: Event) => void) | null;
}

export interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler(action: string, handler: (() => void) | null): void;
}

/** The part of `navigator` this module reads; the browser's own `navigator` fits it. */
export interface MediaNavigator {
  audioSession?: AudioSessionLike;
  mediaSession?: MediaSessionLike;
}

export const MEDIA_ARTIST = 'Qundaq';

/**
 * Sets the audio session to 'playback', so the sound plays with the ring/silent switch on silent and is
 * treated as media. Call it first in a tap that can start sound, before the context is created (R6).
 * Returns whether the browser has the API. Never throws.
 */
export function setPlaybackSession(nav: MediaNavigator): boolean {
  const session = nav.audioSession;
  if (!session || typeof session !== 'object') return false;
  try {
    if (session.type !== 'playback') session.type = 'playback';
    return true;
  } catch {
    return false;
  }
}

/** Reports the audio session's state on every change ('interrupted' while a call or an alarm plays). Returns the unsubscribe function. */
export function watchAudioSession(nav: MediaNavigator, onState: (state: string) => void): () => void {
  const session = nav.audioSession;
  if (!session || typeof session !== 'object' || !('onstatechange' in session)) return () => {};
  session.onstatechange = () => {
    if (typeof session.state === 'string') onState(session.state);
  };
  return () => {
    session.onstatechange = null;
  };
}

export interface MediaInfo {
  /** The mix or the layer names, as the lock screen shows them. */
  title: string;
  /** null: nothing plays (stopped). */
  playing: boolean | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

/** The metadata constructor (`MediaMetadata`); injected so Node tests can pass a plain object. */
export type CreateMetadata = (init: { title: string; artist: string }) => unknown;

/**
 * Publishes what plays to the Media Session (title, artist, no artwork: an image would be a fetch of
 * its own) with play, pause and stop handlers, and keeps `playbackState` in step. Whether the lock
 * screen shows controls for a page that only uses Web Audio is a device-checklist item.
 */
export function updateMediaSession(nav: MediaNavigator, info: MediaInfo, createMetadata: CreateMetadata): void {
  const session = nav.mediaSession;
  if (!session || typeof session !== 'object') return;
  try {
    session.metadata = info.playing === null ? null : createMetadata({ title: info.title, artist: MEDIA_ARTIST });
    session.playbackState = info.playing === null ? 'none' : info.playing ? 'playing' : 'paused';
    session.setActionHandler('play', info.onPlay);
    session.setActionHandler('pause', info.onPause);
    session.setActionHandler('stop', info.onStop);
  } catch (error) {
    console.error('Could not update the media session', error);
  }
}

export function browserCreateMetadata(): CreateMetadata {
  return (init) => (typeof MediaMetadata === 'function' ? new MediaMetadata(init) : null);
}
