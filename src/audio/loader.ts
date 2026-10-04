import type { SoundId } from '../domain/sounds';
import { soundUrl } from './catalog';
import type { BufferLike, ContextLike } from './graph';
import { CROSSFADE_SECONDS, crossfadeLoop, trimSilence } from './loop';

export type FetchBytes = (url: string) => Promise<ArrayBuffer>;
export type LoaderContext = Pick<ContextLike, 'decodeAudioData' | 'createBuffer'>;

/**
 * One sound's loop, ready for a looping source: the file is fetched and decoded by the context, its
 * leading and trailing silence is cut, and the seam is crossfaded away (loop.ts). Rejects when the file
 * is missing or cannot be decoded. Only the first channel is used: the files are mono (spec §3).
 */
export async function loadLoop(
  context: LoaderContext,
  id: SoundId,
  fetchBytes: FetchBytes,
): Promise<BufferLike> {
  const decoded = await context.decodeAudioData(await fetchBytes(soundUrl(id)));
  const samples = decoded.getChannelData(0);
  const { start, end } = trimSilence(samples);
  const loop = crossfadeLoop(
    samples.subarray(start, end),
    Math.round(CROSSFADE_SECONDS * decoded.sampleRate),
  );
  const buffer = context.createBuffer(1, loop.length, decoded.sampleRate);
  buffer.getChannelData(0).set(loop);
  return buffer;
}

/** The browser's fetch, same-origin and served from the service worker's cache. */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
