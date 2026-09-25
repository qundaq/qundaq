export type OfflineStatus =
  | { state: 'ready'; version: string }
  | { state: 'not-ready' | 'unsupported' | 'dev' | 'insecure' };
export type UpdateCheck = 'none' | 'ready' | 'failed';

interface SwStatus {
  version: string;
  cached: number;
  expected: number;
}

// Shared with src/sw/sw.js; tests/platform/sw-client.test.ts keeps the values identical.
// Before asking the browser to update, the page leaves this marker in Cache Storage. The service worker
// refuses to install any new version unless it finds a marker younger than the TTL (and consumes it).
export const UPDATE_CONTROL_CACHE = 'qundaq-control';
export const UPDATE_MARKER_KEY = './__update-requested__';
export const UPDATE_MARKER_TTL_MS = 5 * 60 * 1000;
// How long "Check for updates" waits for a new version to download and verify.
export const UPDATE_INSTALL_TIMEOUT_MS = 60_000;

const supported = () => 'serviceWorker' in navigator;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !supported()) return;
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.error('Service worker registration failed', error);
  });
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  // Checked first, before the dev/prod check, so an insecure LAN dev server reports this too:
  // navigator.serviceWorker is absent on an insecure origin, which would otherwise look like 'unsupported'.
  if (globalThis.isSecureContext === false) return { state: 'insecure' };
  if (!import.meta.env.PROD) return { state: 'dev' };
  if (!supported()) return { state: 'unsupported' };
  const controller = navigator.serviceWorker.controller;
  if (!controller) return { state: 'not-ready' };
  const status = await ask(controller, 2000);
  if (status && status.cached >= status.expected) return { state: 'ready', version: status.version };
  return { state: 'not-ready' };
}

function ask(worker: ServiceWorker, timeoutMs: number): Promise<SwStatus | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<SwStatus>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage({ type: 'GET_STATUS' }, [channel.port2]);
  });
}

export async function hasWaitingUpdate(): Promise<boolean> {
  if (!supported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(registration?.waiting);
}

// The only code path that deliberately contacts the server, and only when the user taps the button.
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!supported()) return 'failed';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'failed';
  try {
    await writeUpdateMarker(registration.scope);
  } catch {
    return 'failed';
  }
  const result = await updateAndWait(registration);
  // Always clear the marker, whatever the outcome. The SW consumes it itself at the very start of a
  // legitimate install, before any fetch, so a 'ready' result no longer needs it either; leaving it
  // fresh could let a later browser-initiated check within the TTL install a newer deploy without a tap.
  await deleteUpdateMarker(registration.scope);
  return result;
}

async function updateAndWait(registration: ServiceWorkerRegistration): Promise<UpdateCheck> {
  try {
    await registration.update();
  } catch {
    return 'failed';
  }
  const incoming = registration.installing ?? registration.waiting;
  if (!incoming) return 'none';
  return (await waitUntilInstalled(incoming)) ? 'ready' : 'failed';
}

// Resolved against the registration's scope, not the document URL: the SW resolves UPDATE_MARKER_KEY
// against its own script URL (self.location), which is the same as the scope because sw.js sits at
// the scope root. The two must name the same absolute cache entry.
function markerUrl(scope: string): string {
  return new URL('__update-requested__', scope).href;
}

async function writeUpdateMarker(scope: string): Promise<void> {
  const control = await caches.open(UPDATE_CONTROL_CACHE);
  await control.put(markerUrl(scope), new Response(String(Date.now())));
}

async function deleteUpdateMarker(scope: string): Promise<void> {
  try {
    const control = await caches.open(UPDATE_CONTROL_CACHE);
    await control.delete(markerUrl(scope));
  } catch {
    // Nothing to clean up if Cache Storage is unavailable; a leftover marker expires after the TTL.
  }
}

// Resolves true once the worker is installed (or already further along), false if it becomes redundant
// or nothing happens within UPDATE_INSTALL_TIMEOUT_MS.
export function waitUntilInstalled(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (installed: boolean) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      resolve(installed);
    };
    const check = () => {
      if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') finish(true);
      else if (worker.state === 'redundant') finish(false);
    };
    const timer = setTimeout(() => finish(false), UPDATE_INSTALL_TIMEOUT_MS);
    worker.addEventListener('statechange', check);
    check();
  });
}

export async function applyUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}
