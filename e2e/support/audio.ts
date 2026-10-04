import type { Page } from '@playwright/test';
import { t } from './i18n';

interface FakeAudioRecord {
  contexts: number;
  resumes: number;
  suspends: number;
  sources: number;
}

/**
 * Answers the bundled sound files with a short synthetic WAV (a real context can decode it, the fake one
 * ignores it) so no test depends on real audio files. `window.fetch` is wrapped in an init script because
 * the service worker handles the page's requests, which `page.route` cannot intercept. A file whose id is
 * in `missing` answers 404.
 */
export async function stubSoundFiles(page: Page, options: { missing?: string[] } = {}) {
  await page.addInitScript((missing) => {
    function toneWav(): ArrayBuffer {
      const rate = 8000;
      const count = rate / 2;
      const buffer = new ArrayBuffer(44 + count * 2);
      const view = new DataView(buffer);
      const text = (offset: number, value: string) =>
        [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
      text(0, 'RIFF');
      view.setUint32(4, 36 + count * 2, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      text(36, 'data');
      view.setUint32(40, count * 2, true);
      for (let i = 0; i < count; i++)
        view.setInt16(
          44 + i * 2,
          Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3 * 32767),
          true,
        );
      return buffer;
    }

    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /(?:^|\/)sounds\/([a-z]+)\.m4a$/.exec(url);
      if (!match) return realFetch(input, init);
      if (missing.includes(match[1]!)) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(
        new Response(toneWav(), { status: 200, headers: { 'Content-Type': 'audio/wav' } }),
      );
    };
  }, options.missing ?? []);
}

/**
 * Replaces `AudioContext` with a fake that keeps the engine's contract without any audio output: the
 * clock runs on `Date.now()` (so `page.clock` drives it), `resume()`/`suspend()` change `state` and fire
 * `statechange`, and a `ConstantSourceNode`'s scheduled stop fires `onended` through `setTimeout`. CI's
 * WebKit runner may not run a real context at all (R11); the one real-context test is Chromium-only.
 * No test hook in the app: this follows the `stubShare` pattern.
 */
export async function fakeAudio(page: Page, options: { missing?: string[] } = {}) {
  await stubSoundFiles(page, options);
  await page.addInitScript(() => {
    const record: FakeAudioRecord = { contexts: 0, resumes: 0, suspends: 0, sources: 0 };
    (window as unknown as { __fakeAudio: FakeAudioRecord }).__fakeAudio = record;

    class FakeParam {
      value = 0;
      setValueAtTime() {
        return this;
      }
      linearRampToValueAtTime() {
        return this;
      }
      setTargetAtTime() {
        return this;
      }
      cancelScheduledValues() {
        return this;
      }
      cancelAndHoldAtTime() {
        return this;
      }
    }

    class FakeNode {
      connect() {
        return this;
      }
      disconnect() {}
    }

    class FakeGain extends FakeNode {
      gain = new FakeParam();
    }

    class FakeCompressor extends FakeNode {
      threshold = new FakeParam();
      knee = new FakeParam();
      ratio = new FakeParam();
      attack = new FakeParam();
      release = new FakeParam();
    }

    class FakeBufferSource extends FakeNode {
      buffer: unknown = null;
      loop = false;
      onended: ((event: Event) => void) | null = null;
      start() {
        record.sources += 1;
      }
      stop() {}
    }

    class FakeAudioContext {
      state = 'suspended';
      readonly sampleRate = 48_000;
      readonly destination = new FakeNode();
      onstatechange: ((event: Event) => void) | null = null;
      private elapsed = 0;
      private runningSince: number | null = null;

      constructor() {
        record.contexts += 1;
      }

      get currentTime(): number {
        return (
          this.elapsed + (this.runningSince === null ? 0 : (Date.now() - this.runningSince) / 1000)
        );
      }

      private setState(state: string): void {
        if (this.state === state) return;
        this.state = state;
        setTimeout(() => this.onstatechange?.(new Event('statechange')), 0);
      }

      resume(): Promise<void> {
        record.resumes += 1;
        if (this.runningSince === null) this.runningSince = Date.now();
        this.setState('running');
        return Promise.resolve();
      }

      suspend(): Promise<void> {
        record.suspends += 1;
        this.elapsed = this.currentTime;
        this.runningSince = null;
        this.setState('suspended');
        return Promise.resolve();
      }

      close(): Promise<void> {
        this.setState('closed');
        return Promise.resolve();
      }

      createGain() {
        return new FakeGain();
      }

      createDynamicsCompressor() {
        return new FakeCompressor();
      }

      createBufferSource() {
        return new FakeBufferSource();
      }

      createConstantSource() {
        const source = new FakeBufferSource() as FakeBufferSource & { offset: FakeParam };
        source.offset = new FakeParam();
        source.start = () => {}; // the sentinel is not a sound: `sources` counts buffer sources only
        source.stop = (when?: number) => {
          if (when === undefined) return;
          setTimeout(
            () => source.onended?.(new Event('ended')),
            Math.max(0, (when - this.currentTime) * 1000),
          );
        };
        return source;
      }

      decodeAudioData(): Promise<unknown> {
        return Promise.resolve(this.createBuffer(1, 48_000, 48_000));
      }

      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = new Float32Array(length);
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: () => data,
        };
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
  });
}

/** What the fake saw: how many contexts were created, resumed, suspended, and sources started. */
export function fakeAudioRecord(page: Page): Promise<FakeAudioRecord> {
  return page.evaluate(() => (window as unknown as { __fakeAudio: FakeAudioRecord }).__fakeAudio);
}

/** The Sounds tab's tile for a sound, by the prefix of its accessible name ("<name>: <action>"). */
export function tile(page: Page, name: string) {
  return page
    .getByRole('group', { name: t('sounds.tiles'), exact: true })
    .getByRole('button', { name, exact: false });
}

/** The status line on the Sounds tab (sounds.status.playing/.stopped/…). */
export function soundStatus(page: Page) {
  return page.getByTestId('sound-status');
}
