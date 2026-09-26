import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPDATE_CONTROL_CACHE,
  UPDATE_INSTALL_TIMEOUT_MS,
  UPDATE_MARKER_KEY,
  UPDATE_MARKER_TTL_MS,
  checkForUpdate,
  getOfflineStatus,
  waitUntilInstalled,
} from '../../src/platform/sw-client';
import { FakeCacheStorage } from '../support/fake-caches';

const MARKER_URL = 'https://app.test/__update-requested__';

describe('constants shared with the service worker', () => {
  const sw = readFileSync(new URL('../../src/sw/sw.js', import.meta.url), 'utf8');

  it('have the agreed values', () => {
    expect(UPDATE_CONTROL_CACHE).toBe('qundaq-control');
    expect(UPDATE_MARKER_KEY).toBe('./__update-requested__');
    expect(UPDATE_MARKER_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('are identical in src/sw/sw.js', () => {
    expect(sw).toContain(`const UPDATE_CONTROL_CACHE = '${UPDATE_CONTROL_CACHE}';`);
    expect(sw).toContain(`const UPDATE_MARKER_KEY = '${UPDATE_MARKER_KEY}';`);
    expect(sw).toContain(`const UPDATE_MARKER_TTL_MS = ${UPDATE_MARKER_TTL_MS};`);
  });

  it('keep the control cache outside the app cache prefix that activate cleans up', () => {
    expect(sw).toContain(`const APP_CACHE_PREFIX = 'qundaq-app-';`);
    expect(UPDATE_CONTROL_CACHE.startsWith('qundaq-app-')).toBe(false);
  });
});

describe('getOfflineStatus', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 'insecure' when the page is not a secure context, before the dev/prod check", async () => {
    vi.stubGlobal('isSecureContext', false);
    expect(await getOfflineStatus()).toEqual({ state: 'insecure' });
  });
});

class FakeWorker extends EventTarget {
  constructor(public state: ServiceWorkerState) {
    super();
  }
  moveTo(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

describe('waitUntilInstalled', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(['installed', 'activating', 'activated'] as const)(
    'resolves true when the worker becomes %s',
    async (state) => {
      const worker = new FakeWorker('installing');
      const result = waitUntilInstalled(worker as unknown as ServiceWorker);
      worker.moveTo(state);
      expect(await result).toBe(true);
    },
  );

  it.each(['installed', 'activating', 'activated'] as const)(
    'resolves true when the worker is already %s',
    async (state) => {
      expect(await waitUntilInstalled(new FakeWorker(state) as unknown as ServiceWorker)).toBe(
        true,
      );
    },
  );

  it('resolves false when the worker becomes redundant', async () => {
    const worker = new FakeWorker('installing');
    const result = waitUntilInstalled(worker as unknown as ServiceWorker);
    worker.moveTo('redundant');
    expect(await result).toBe(false);
  });

  it('resolves false after 60 seconds without a decision', async () => {
    expect(UPDATE_INSTALL_TIMEOUT_MS).toBe(60_000);
    const worker = new FakeWorker('installing');
    let settled: boolean | undefined;
    void waitUntilInstalled(worker as unknown as ServiceWorker).then((value) => (settled = value));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
  });

  it.each([['installed'], ['redundant'], ['timeout']] as const)(
    'removes its listener and clears its timer (%s)',
    async (outcome) => {
      const worker = new FakeWorker('installing');
      const remove = vi.spyOn(worker, 'removeEventListener');
      const result = waitUntilInstalled(worker as unknown as ServiceWorker);
      if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(UPDATE_INSTALL_TIMEOUT_MS);
      else worker.moveTo(outcome);
      await result;
      expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe('checkForUpdate', () => {
  let caches: FakeCacheStorage;
  let markerAtUpdate: string | null | undefined;

  function stubRegistration(
    update: (registration: {
      installing: FakeWorker | null;
      waiting: FakeWorker | null;
    }) => Promise<void>,
    scope = 'https://app.test/',
  ) {
    const registration = {
      scope,
      installing: null as FakeWorker | null,
      waiting: null as FakeWorker | null,
      update: async () => {
        const marker = await caches.stores.get(UPDATE_CONTROL_CACHE)?.match(MARKER_URL);
        markerAtUpdate = marker ? await marker.text() : null;
        await update(registration);
      },
    };
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => registration } });
    return registration;
  }

  const markerNow = async () => caches.stores.get(UPDATE_CONTROL_CACHE)?.match(MARKER_URL);

  beforeEach(() => {
    caches = new FakeCacheStorage('https://app.test/');
    markerAtUpdate = undefined;
    vi.stubGlobal('caches', caches);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('resolves the marker key against the registration scope, not the document/cache base URL', async () => {
    // The page's own base URL (here, the FakeCacheStorage base 'https://app.test/') must not matter.
    // The SW resolves './__update-requested__' against its own script URL, which is the scope because
    // sw.js sits at the scope root — so the page must resolve the marker the same way, via the scope,
    // for the two to name the same cache entry.
    const scope = 'https://qundaq.github.io/qundaq/';
    let seenDuringUpdate: string | undefined;
    stubRegistration(async () => {
      const marker = await caches.stores
        .get(UPDATE_CONTROL_CACHE)
        ?.match(new URL('__update-requested__', scope).href);
      seenDuringUpdate = marker ? await marker.text() : undefined;
    }, scope);
    await checkForUpdate();
    expect(seenDuringUpdate).toBeDefined();
  });

  it('writes a fresh update marker immediately before asking the browser to update', async () => {
    const before = Date.now();
    stubRegistration(async () => {});
    await checkForUpdate();
    expect(markerAtUpdate).not.toBeNull();
    expect(Number(markerAtUpdate)).toBeGreaterThanOrEqual(before);
    expect(Number(markerAtUpdate)).toBeLessThanOrEqual(Date.now());
  });

  it("returns 'none' and deletes the marker when there is no new version", async () => {
    stubRegistration(async () => {});
    expect(await checkForUpdate()).toBe('none');
    expect(await markerNow()).toBeUndefined();
  });

  it("returns 'failed' and deletes the marker when the update check fails", async () => {
    stubRegistration(async () => {
      throw new TypeError('offline');
    });
    expect(await checkForUpdate()).toBe('failed');
    expect(await markerNow()).toBeUndefined();
  });

  it("returns 'failed' and deletes the marker when the new version fails to install", async () => {
    stubRegistration(async (registration) => {
      const worker = new FakeWorker('installing');
      registration.installing = worker;
      setTimeout(() => worker.moveTo('redundant'), 0);
    });
    expect(await checkForUpdate()).toBe('failed');
    expect(await markerNow()).toBeUndefined();
  });

  it("returns 'ready' once the new version is installed, and clears the marker too", async () => {
    // The SW consumes the marker itself at the very start of a legitimate install, before any fetch.
    // This unit test never runs the real SW install handler, so it can observe whether the page also
    // clears the marker on its own after a 'ready' outcome: leaving it fresh would let a later
    // browser-initiated check within the TTL install a newer deploy without a tap.
    stubRegistration(async (registration) => {
      const worker = new FakeWorker('installing');
      registration.installing = worker;
      setTimeout(() => worker.moveTo('installed'), 0);
    });
    expect(await checkForUpdate()).toBe('ready');
    expect(await markerNow()).toBeUndefined();
  });

  it("returns 'failed' when there is no registration", async () => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });
    expect(await checkForUpdate()).toBe('failed');
  });
});
