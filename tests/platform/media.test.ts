import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_ARTIST,
  setPlaybackSession,
  updateMediaSession,
  watchAudioSession,
  type AudioSessionLike,
  type MediaSessionLike,
} from '../../src/platform/media';

function fakeAudioSession(state = 'active'): AudioSessionLike & { state: string } {
  return { type: 'auto', state, onstatechange: null };
}

function fakeMediaSession(): MediaSessionLike & { handlers: Map<string, (() => void) | null> } {
  const handlers = new Map<string, (() => void) | null>();
  return {
    metadata: null,
    playbackState: 'none',
    handlers,
    setActionHandler: (action, handler) => {
      handlers.set(action, handler);
    },
  };
}

const createMetadata = (init: { title: string; artist: string }) => ({ ...init, fake: true });

describe('setPlaybackSession', () => {
  it('sets the session type to playback where the API exists, and says so', () => {
    const audioSession = fakeAudioSession();
    expect(setPlaybackSession({ audioSession })).toBe(true);
    expect(audioSession.type).toBe('playback');
  });

  it('is a no-op without the API, and never throws', () => {
    expect(setPlaybackSession({})).toBe(false);
    const throwing = {
      get type() {
        return 'auto';
      },
      set type(_value: string) {
        throw new TypeError('read only');
      },
    };
    expect(setPlaybackSession({ audioSession: throwing })).toBe(false);
  });
});

describe('watchAudioSession', () => {
  it('reports every state change and stops reporting after unsubscribe', () => {
    const audioSession = fakeAudioSession();
    const onState = vi.fn();
    const stop = watchAudioSession({ audioSession }, onState);
    audioSession.state = 'interrupted';
    audioSession.onstatechange?.(new Event('statechange'));
    audioSession.state = 'active';
    audioSession.onstatechange?.(new Event('statechange'));
    expect(onState.mock.calls).toEqual([['interrupted'], ['active']]);
    stop();
    expect(audioSession.onstatechange).toBeNull();
  });

  it('does nothing without the API', () => {
    expect(() => watchAudioSession({}, vi.fn())()).not.toThrow();
  });
});

describe('updateMediaSession', () => {
  it('publishes the title with the app as artist, the playback state and the three handlers', () => {
    const mediaSession = fakeMediaSession();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onStop = vi.fn();
    updateMediaSession({ mediaSession }, { title: 'Beyaz gürültü + Yağmur', playing: true, onPlay, onPause, onStop }, createMetadata);
    expect(mediaSession.metadata).toEqual({ title: 'Beyaz gürültü + Yağmur', artist: MEDIA_ARTIST, fake: true });
    expect(mediaSession.playbackState).toBe('playing');
    mediaSession.handlers.get('play')?.();
    mediaSession.handlers.get('pause')?.();
    mediaSession.handlers.get('stop')?.();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('shows paused, and clears the metadata when nothing plays', () => {
    const mediaSession = fakeMediaSession();
    const handlers = { onPlay: vi.fn(), onPause: vi.fn(), onStop: vi.fn() };
    updateMediaSession({ mediaSession }, { title: 'Gece', playing: false, ...handlers }, createMetadata);
    expect(mediaSession.playbackState).toBe('paused');
    updateMediaSession({ mediaSession }, { title: '', playing: null, ...handlers }, createMetadata);
    expect(mediaSession.playbackState).toBe('none');
    expect(mediaSession.metadata).toBeNull();
  });

  it('is a no-op without the API, and swallows a browser that refuses a handler', () => {
    const handlers = { onPlay: vi.fn(), onPause: vi.fn(), onStop: vi.fn() };
    expect(() => updateMediaSession({}, { title: 'x', playing: true, ...handlers }, createMetadata)).not.toThrow();
    const refusing: MediaSessionLike = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: () => {
        throw new TypeError('unsupported action');
      },
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => updateMediaSession({ mediaSession: refusing }, { title: 'x', playing: true, ...handlers }, createMetadata)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
