import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Proves MANIFESTO.md commitment 5: a new version is downloaded only after the user taps
// "Check for updates". Uses e2e/support/two-build-server.mjs, which serves build v1 or v2 on one URL.
const APP = 'http://localhost:4174/';
const READY = /Çevrimdışı hazır \(([0-9a-f]+)\)/;

async function switchTo(request: APIRequestContext, build: 'v1' | 'v2') {
  expect((await request.get(`${APP}__switch?to=${build}`)).ok()).toBe(true);
}

async function servedPaths(request: APIRequestContext): Promise<string[]> {
  return (await request.get(`${APP}__log`)).json();
}

async function offlineReadyVersion(page: Page): Promise<string> {
  await page.getByRole('navigation', { name: 'Ana gezinme' }).getByRole('button', { name: 'Ayarlar', exact: true }).click();
  const ready = page.getByText(READY);
  await expect(ready).toBeVisible({ timeout: 20_000 });
  return READY.exec((await ready.textContent()) ?? '')?.[1] ?? '';
}

test('a new version is downloaded only after the user asks for it', async ({ page, context, request, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'The update-gate e2e runs in Chromium only; on iOS it is covered by docs/device-checklist.md',
  );

  // Install v1.
  await switchTo(request, 'v1');
  await page.goto(APP);
  const v1 = await offlineReadyVersion(page);
  expect(v1).toMatch(/^[0-9a-f]{12}$/);

  // Deploy v2, then do what the browser does on its own while the phone is online: re-check sw.js.
  await switchTo(request, 'v2');
  await page.reload();
  await page.evaluate(() =>
    navigator.serviceWorker
      .getRegistration()
      .then((r) => r?.update())
      .catch(() => {}),
  );
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.installing === null))
    .toBe(true);

  // Nothing was installed, and nothing but sw.js itself was downloaded.
  const waiting = await page.evaluate(async () => {
    const waitingWorker = (await navigator.serviceWorker.getRegistration())?.waiting;
    return waitingWorker ? `${waitingWorker.scriptURL} (${waitingWorker.state})` : null;
  });
  expect.soft(waiting, 'registration.waiting').toBeNull();
  const served = await servedPaths(request);
  expect.soft(served, 'the browser fetched the new sw.js').toContain('/sw.js');
  expect(served.filter((path) => path !== '/sw.js'), 'paths served besides /sw.js').toEqual([]);

  // Closing the app and opening it again still runs v1.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(APP);
  expect(await offlineReadyVersion(reopened)).toBe(v1);

  // Only the user's tap downloads v2, and "Restart" starts it.
  await reopened.getByRole('button', { name: 'Güncellemeleri kontrol et', exact: true }).click();
  await expect(reopened.getByText('Yeni sürüm hazır.')).toBeVisible({ timeout: 30_000 });
  const reloaded = reopened.waitForEvent('load');
  await reopened.getByRole('button', { name: 'Yeniden başlat', exact: true }).click();
  await reloaded;
  const after = await offlineReadyVersion(reopened);
  expect(after).not.toBe(v1);
});
