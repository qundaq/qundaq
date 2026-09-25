import { expect, test, type Page } from '@playwright/test';

// The browser may re-check the app's own sw.js for updates on navigation. That is the single request
// MANIFESTO.md documents as outside the app's control; it carries no user data. Anything else counts
// as leaked, including an sw.js on any other origin or path.
function isBrowserSwUpdateCheck(url: string): boolean {
  const parsed = new URL(url);
  return parsed.origin === 'http://localhost:4173' && parsed.pathname === '/sw.js';
}
const WEBKIT_SKIP =
  'Playwright WebKit: route()/setOffline() act before the service worker; iOS covered by docs/device-checklist.md';

async function installAndWaitForOfflineReady(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByText(/Çevrimdışı hazır/)).toBeVisible({ timeout: 20_000 });
}

test('shows "offline ready" once the service worker has cached the app', async ({ page }) => {
  await installAndWaitForOfflineReady(page);
});

test('cold-starts with the network disabled', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);
  await context.setOffline(true);
  const fresh = await context.newPage();
  await fresh.goto('./');
  await expect(fresh.getByRole('navigation', { name: 'Ana gezinme' })).toBeVisible();
});

test('makes no network requests after the first load', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);

  const leaked: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (!isBrowserSwUpdateCheck(url)) leaked.push(url);
    return route.abort();
  });

  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  for (const name of ['Günlük', 'Özet', 'Sesler', 'Ana', 'Ayarlar']) {
    await nav.getByRole('button', { name, exact: true }).click();
  }
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  expect(leaked).toEqual([]);
});
