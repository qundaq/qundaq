// Qundaq service worker.
// Serves the app exclusively from its cache and never forwards a request to the network.
// Its only network use is the install-time download below. After the first install that download
// happens only when the user tapped "Check for updates" (see checkForUpdate in src/platform/sw-client.ts).
// scripts/build-sw.mjs replaces the two placeholder values below at build time.
const VERSION = '__VERSION__';
// [{ url, sha256 }]: every file of this version and the lowercase hex SHA-256 of its bytes.
const PRECACHE = __PRECACHE__;
const APP_CACHE_PREFIX = 'qundaq-app-';
const CACHE = APP_CACHE_PREFIX + VERSION;

// Shared with src/platform/sw-client.ts; tests/platform/sw-client.test.ts keeps the values identical.
// The control cache name must not start with APP_CACHE_PREFIX, or activate would delete it.
const UPDATE_CONTROL_CACHE = 'qundaq-control';
const UPDATE_MARKER_KEY = './__update-requested__';
const UPDATE_MARKER_TTL_MS = 300000; // 5 minutes

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // The first install (nothing active yet) always proceeds. Any later install is a new version, which
      // the browser may have found on its own; refuse it before downloading anything unless the user asked.
      // A rejected install makes this worker redundant and leaves the current version active.
      if (self.registration.active && !(await consumeUpdateRequest())) {
        throw new Error('Update was not requested by the user; refusing to install.');
      }
      await precacheVerified();
    })(),
  );
  // No skipWaiting() here: an installed update activates when the user taps "Restart" (SKIP_WAITING message)
  // or when the app is next opened after all of its pages were closed.
});

// True if the page wrote a fresh "update requested" marker. The marker is deleted either way.
async function consumeUpdateRequest() {
  if (!(await caches.has(UPDATE_CONTROL_CACHE))) return false;
  const control = await caches.open(UPDATE_CONTROL_CACHE);
  const marker = await control.match(UPDATE_MARKER_KEY);
  if (!marker) return false;
  await control.delete(UPDATE_MARKER_KEY);
  const age = Date.now() - Number(await marker.text());
  return age >= 0 && age < UPDATE_MARKER_TTL_MS;
}

// Downloads every file, checks each against its SHA-256, and caches them only once all of them verified.
async function precacheVerified() {
  const verified = await Promise.all(
    PRECACHE.map(async ({ url, sha256 }) => {
      // cache: 'reload' bypasses the HTTP cache so a new version never mixes in stale files.
      const request = new Request(url, { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Precache ${url}: HTTP ${response.status}`);
      const digest = toHex(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()));
      if (digest !== sha256) throw new Error(`Precache ${url}: SHA-256 mismatch`);
      return { request, response };
    }),
  );
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(verified.map(({ request, response }) => cache.put(request, response)));
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(APP_CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (message?.type === 'GET_STATUS') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.keys()).length;
        event.ports[0]?.postMessage({ version: VERSION, cached, expected: PRECACHE.length });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // The app never talks to other origins or sends non-GET requests; refuse instead of passing through.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    event.respondWith(Response.error());
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary: the dev/preview static server sends "Vary: Origin", and the browser
      // attaches an Origin header to same-origin CORS requests (module scripts, crossorigin
      // stylesheets) that the service worker's own precache fetches never sent — without this
      // the default Vary-aware match would miss every precached asset. The app is single-origin,
      // so ignoring Vary here is safe.
      if (request.mode === 'navigate') {
        return (await cache.match('./index.html', { ignoreVary: true })) ?? Response.error();
      }
      return (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) ?? Response.error();
    })(),
  );
});
