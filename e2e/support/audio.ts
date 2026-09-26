import type { Page } from '@playwright/test';

interface FakeAudioRecord {
  contexts: number;
  resumes: number;
  suspends: number;
  sources: number;
}

/**
 * Replaces `AudioContext` with a fake that keeps the engine's contract without any audio output: the
 * clock runs on `Date.now()` (so `page.clock` drives it), `resume()`/`suspend()` change `state` and fire
 * `statechange`, and a `ConstantSourceNode`'s scheduled stop fires `onended` through `setTimeout`. CI's
 * WebKit runner may not run a real context at all (R11); the one real-context test is Chromium-only.
 * No test hook in the app: this follows the `stubShare` pattern.
 */
export async function fakeAudio(page: Page) {
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
        const context = this;
        const source = new FakeBufferSource() as FakeBufferSource & { offset: FakeParam };
        source.offset = new FakeParam();
        source.start = () => {}; // the sentinel is not a sound: `sources` counts buffer sources only
        source.stop = (when?: number) => {
          if (when === undefined) return;
          setTimeout(
            () => source.onended?.(new Event('ended')),
            Math.max(0, (when - context.currentTime) * 1000),
          );
        };
        return source;
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

/** The Sesler tab's tile for a sound, by its name. */
export function tile(page: Page, name: string) {
  return page
    .getByRole('group', { name: 'Sesler', exact: true })
    .getByRole('button', { name, exact: true });
}

/** The status line under the play button ("Çalıyor · …", "Durdu", …). */
export function soundStatus(page: Page) {
  return page.locator('.sound-status');
}
