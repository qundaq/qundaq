import { useEffect, useSyncExternalStore } from 'react';
import { generateSound } from '../../audio/catalog';
import { createSoundEngine, type EngineState, type SoundEngine } from '../../audio/engine';
import {
  browserCreateMetadata,
  setPlaybackSession,
  updateMediaSession,
  watchAudioSession,
} from '../../platform/media';

let engine: SoundEngine | null = null;

/**
 * The app's one engine, created on first use and kept for the session, so playback goes on across tab
 * switches; the sounds tab is only a view of it. Tests build their own with createSoundEngine (R19).
 */
export function getSoundEngine(): SoundEngine {
  if (engine) return engine;
  const created = createSoundEngine({
    createContext: () => new AudioContext(),
    generate: generateSound,
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
    prepareSession: () => {
      setPlaybackSession(navigator);
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') created.onVisible();
  });
  watchAudioSession(navigator, (state) => created.onSessionState(state));
  engine = created;
  return created;
}

export function useSoundEngine(): { engine: SoundEngine; state: EngineState } {
  const current = getSoundEngine();
  const state = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot);
  return { engine: current, state };
}

const createMetadata = browserCreateMetadata();

/** Keeps the Media Session's title, state and handlers in step with the engine (no artwork, R10). */
export function useMediaSession(engine: SoundEngine, state: EngineState, title: string): void {
  useEffect(() => {
    updateMediaSession(
      navigator,
      {
        title,
        playing: state.status === 'stopped' ? null : state.status === 'playing',
        onPlay: () => engine.play(),
        onPause: () => engine.pause(),
        onStop: () => engine.stop(),
      },
      createMetadata,
    );
  }, [engine, state.status, title]);
}
