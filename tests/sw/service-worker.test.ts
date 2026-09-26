// Runs the real src/sw/sw.js (rendered by the real build step) against fake browser APIs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderServiceWorker } from '../../scripts/lib/sw-manifest.mjs';
import { FakeCacheStorage } from '../support/fake-caches';

const ORIGIN = 'https://app.test';
const SW_URL = `${ORIGIN}/sw.js`;
const TEMPLATE = readFileSync(new URL('../../src/sw/sw.js', import.meta.url), 'utf8');
const FILES = [
  { path: 'index.html', content: '<!doctype html><title>t</title>' },
  { path: 'assets/app-abc.js', content: 'console.log(1)' },
  { path: 'icon.png', content: new Uint8Array([137, 80, 78, 71, 0, 255]) },
];
const { source, version } = renderServiceWorker(TEMPLATE, FILES);
const APP_CACHE = `qundaq-app-${version}`;
const CONTROL_CACHE = 'qundaq-control';
const MARKER_URL = `${ORIGIN}/__update-requested__`;
const MINUTE = 60_000;

type Listener = (event: unknown) => void;

interface Options {
  /** An already active worker means this install is an update, not the first install. */
  active?: boolean;
  /** Served bodies by path; defaults to FILES. */
  served?: Record<string, string | Uint8Array>;
  caches?: FakeCacheStorage;
}

function loadServiceWorker(options: Options = {}) {
  const listeners: Record<string, Listener> = {};
  const caches = options.caches ?? new FakeCacheStorage(`${ORIGIN}/`);
  const served = options.served ?? Object.fromEntries(FILES.map((f) => [`/${f.path}`, f.content]));
  const fetched: { url: string; cache: RequestCache }[] = [];

  // Node's Request needs absolute URLs; the service worker resolves relative ones against its own URL.
  class SwRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, SW_URL), init);
    }
  }
  const fetch = (request: Request) => {
    fetched.push({ url: request.url, cache: request.cache });
    const body = served[new URL(request.url).pathname];
    return Promise.resolve(
      body === undefined
        ? new Response('missing', { status: 404 })
        : new Response(body as BodyInit),
    );
  };
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    registration: { active: options.active ? {} : null },
    location: new URL(SW_URL),
    clients: { claim: async () => {} },
    skipWaiting: () => {},
  };
  // The built service worker source runs in this sandbox on purpose; there is no import to lint.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function('self', 'caches', 'fetch', 'Request', 'Response', 'crypto', source)(
    self,
    caches,
    fetch,
    SwRequest,
    Response,
    globalThis.crypto,
  );

  const dispatch = (type: string, extra: object = {}) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]?.({ ...extra, waitUntil: (p: Promise<unknown>) => (pending = p) });
    return pending;
  };
  return {
    caches,
    fetched,
    install: () => dispatch('install'),
    activate: () => dispatch('activate'),
    status: async () => {
      let reply: unknown;
      await dispatch('message', {
        data: { type: 'GET_STATUS' },
        ports: [{ postMessage: (m: unknown) => (reply = m) }],
      });
      return reply;
    },
    fetch: async (request: { url: string; method?: string; mode?: string }) => {
      let response: Promise<Response> | Response | undefined;
      listeners.fetch?.({
        request: { method: 'GET', mode: 'cors', ...request },
        respondWith: (r: Promise<Response>) => (response = r),
      });
      return response;
    },
  };
}

async function writeMarker(caches: FakeCacheStorage, requestedAt: number) {
  const control = await caches.open(CONTROL_CACHE);
  await control.put('./__update-requested__', new Response(String(requestedAt)));
}

const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');

describe('service worker install: first install', () => {
  it('downloads every file with cache: reload, verifies it and caches it under the app prefix', async () => {
    const sw = loadServiceWorker();
    await expect(sw.install()).resolves.toBeUndefined();
    expect(sw.fetched.map((f) => f.url).sort()).toEqual(
      FILES.map((f) => `${ORIGIN}/${f.path}`).sort(),
    );
    expect(sw.fetched.every((f) => f.cache === 'reload')).toBe(true);
    const cache = sw.caches.stores.get(APP_CACHE);
    expect([...(cache?.entries.keys() ?? [])].sort()).toEqual(
      FILES.map((f) => `${ORIGIN}/${f.path}`).sort(),
    );
    const png = await cache?.match('./icon.png');
    expect(sha256(new Uint8Array(await png!.arrayBuffer()))).toBe(sha256(FILES[2]!.content));
  });

  it('does not need an update marker', async () => {
    const sw = loadServiceWorker({ active: false });
    await expect(sw.install()).resolves.toBeUndefined();
  });
});

describe('service worker install: integrity', () => {
  it('fails, caches nothing and keeps no cache when a file does not match its SHA-256', async () => {
    const served = {
      '/index.html': FILES[0]!.content,
      '/assets/app-abc.js': 'console.log("tampered")',
      '/icon.png': FILES[2]!.content,
    };
    const sw = loadServiceWorker({ served });
    await expect(sw.install()).rejects.toThrow(/SHA-256/);
    expect(await sw.caches.has(APP_CACHE)).toBe(false);
  });

  it('fails when a file is not served with an ok status', async () => {
    const served = { '/index.html': FILES[0]!.content, '/icon.png': FILES[2]!.content };
    const sw = loadServiceWorker({ served });
    await expect(sw.install()).rejects.toThrow(/404/);
    expect(await sw.caches.has(APP_CACHE)).toBe(false);
  });

  it('deletes the new cache and rethrows when storing fails after the cache was opened', async () => {
    const caches = new FakeCacheStorage(`${ORIGIN}/`);
    caches.onCreate = (name, cache) => {
      if (name === APP_CACHE) cache.failPut = true;
    };
    const sw = loadServiceWorker({ caches });
    await expect(sw.install()).rejects.toThrow(/QuotaExceededError/);
    expect(await caches.has(APP_CACHE)).toBe(false);
  });
});

describe('service worker install: update gate', () => {
  it('refuses an update nobody asked for before downloading anything', async () => {
    const sw = loadServiceWorker({ active: true });
    await expect(sw.install()).rejects.toThrow(/not requested/);
    expect(sw.fetched).toEqual([]);
    expect(await sw.caches.has(APP_CACHE)).toBe(false);
  });

  it('refuses an update whose request marker is older than 5 minutes, and deletes the marker', async () => {
    const caches = new FakeCacheStorage(`${ORIGIN}/`);
    await writeMarker(caches, Date.now() - 5 * MINUTE - 1000);
    const sw = loadServiceWorker({ active: true, caches });
    await expect(sw.install()).rejects.toThrow(/not requested/);
    expect(sw.fetched).toEqual([]);
    expect(await caches.stores.get(CONTROL_CACHE)?.match(MARKER_URL)).toBeUndefined();
  });

  it('refuses an update whose marker is not a timestamp', async () => {
    const caches = new FakeCacheStorage(`${ORIGIN}/`);
    await (await caches.open(CONTROL_CACHE)).put('./__update-requested__', new Response('soon'));
    const sw = loadServiceWorker({ active: true, caches });
    await expect(sw.install()).rejects.toThrow(/not requested/);
    expect(sw.fetched).toEqual([]);
  });

  it('installs an update the user asked for and consumes the marker', async () => {
    const caches = new FakeCacheStorage(`${ORIGIN}/`);
    await writeMarker(caches, Date.now() - 1000);
    const sw = loadServiceWorker({ active: true, caches });
    await expect(sw.install()).resolves.toBeUndefined();
    expect(sw.fetched).toHaveLength(FILES.length);
    expect(await caches.stores.get(CONTROL_CACHE)?.match(MARKER_URL)).toBeUndefined();
    expect(await caches.has(APP_CACHE)).toBe(true);
  });
});

describe('service worker activate', () => {
  it('deletes older app caches only, keeping the control cache and unrelated caches', async () => {
    const caches = new FakeCacheStorage(`${ORIGIN}/`);
    for (const name of ['qundaq-app-oldversion1', CONTROL_CACHE, 'someone-else'])
      await caches.open(name);
    const sw = loadServiceWorker({ caches });
    await sw.install();
    await sw.activate();
    expect((await caches.keys()).sort()).toEqual([APP_CACHE, CONTROL_CACHE, 'someone-else'].sort());
  });
});

describe('service worker messages and fetch', () => {
  it('GET_STATUS reports the version and how many of the expected files are cached', async () => {
    const sw = loadServiceWorker();
    expect(await sw.status()).toEqual({ version, cached: 0, expected: FILES.length });
    await sw.install();
    expect(await sw.status()).toEqual({ version, cached: FILES.length, expected: FILES.length });
  });

  it('serves from the cache and never forwards a request to the network', async () => {
    const sw = loadServiceWorker();
    await sw.install();
    const downloads = sw.fetched.length;
    expect(await (await sw.fetch({ url: `${ORIGIN}/assets/app-abc.js` }))?.text()).toBe(
      'console.log(1)',
    );
    expect(
      await (await sw.fetch({ url: `${ORIGIN}/some/route`, mode: 'navigate' }))?.text(),
    ).toContain('<title>t</title>');
    expect((await sw.fetch({ url: `${ORIGIN}/not-cached.js` }))?.type).toBe('error');
    expect((await sw.fetch({ url: 'https://evil.example/x.js' }))?.type).toBe('error');
    expect((await sw.fetch({ url: `${ORIGIN}/index.html`, method: 'POST' }))?.type).toBe('error');
    expect(sw.fetched).toHaveLength(downloads);
  });
});
