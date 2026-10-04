import { describe, expect, it, vi } from 'vitest';
import { soundUrl } from '../../src/audio/catalog';
import { fetchBytes, loadLoop } from '../../src/audio/loader';
import { CROSSFADE_SECONDS } from '../../src/audio/loop';
import { FakeContext } from '../support/fake-audio';

const bytes = new ArrayBuffer(8);

function contextWith(samples: Float32Array, sampleRate = 8000): FakeContext {
  const context = new FakeContext({ sampleRate });
  context.decodeResult = () =>
    Promise.resolve({ sampleRate, length: samples.length, getChannelData: () => samples });
  return context;
}

describe('soundUrl', () => {
  it('is relative, so the app works under a sub-path', () => {
    expect(soundUrl('white')).toBe('sounds/white.m4a');
  });
});

describe('loadLoop', () => {
  it('fetches the sound, trims the padding and bakes the seam crossfade into one mono buffer', async () => {
    const rate = 8000;
    const body = new Float32Array(8000).fill(0.5);
    const padded = new Float32Array(10_000);
    padded.set(body, 1000);
    const context = contextWith(padded, rate);
    const fetchBytes = vi.fn(() => Promise.resolve(bytes));

    const buffer = await loadLoop(context, 'train', fetchBytes);

    expect(fetchBytes).toHaveBeenCalledWith('sounds/train.m4a');
    const fade = Math.round(CROSSFADE_SECONDS * rate);
    expect(context.buffers).toEqual([{ length: 8000 - fade, sampleRate: rate }]);
    expect(buffer.getChannelData(0)).toBe(context.bufferData[0]);
    // The middle of the loop is the file's own samples.
    expect(buffer.getChannelData(0)[fade + 10]).toBeCloseTo(0.5, 6);
  });

  it('rejects when the file cannot be fetched, and never decodes', async () => {
    const context = contextWith(new Float32Array(10));
    const decode = vi.spyOn(context, 'decodeAudioData');
    await expect(
      loadLoop(context, 'white', () => Promise.reject(new Error('HTTP 404'))),
    ).rejects.toThrow('HTTP 404');
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects when the bytes cannot be decoded', async () => {
    const context = new FakeContext();
    context.decodeResult = () => Promise.reject(new Error('EncodingError'));
    await expect(loadLoop(context, 'white', () => Promise.resolve(bytes))).rejects.toThrow(
      'EncodingError',
    );
    expect(context.buffers).toEqual([]);
  });
});

describe('fetchBytes', () => {
  it('returns the body of a successful response and throws on any other status', async () => {
    const body = new ArrayBuffer(4);
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        url === 'sounds/white.m4a'
          ? new Response(body, { status: 200 })
          : new Response(null, { status: 404 }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    try {
      expect((await fetchBytes('sounds/white.m4a')).byteLength).toBe(4);
      await expect(fetchBytes('sounds/rain.m4a')).rejects.toThrow(
        'Could not load sounds/rain.m4a: HTTP 404',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
