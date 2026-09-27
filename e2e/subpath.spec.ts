import { expect, test, type APIRequestContext } from '@playwright/test';
import { t } from './support/i18n';
import { addBabyInSettings, babyCard, openTab, cardAction } from './support/tracking';

// The site is published at https://qundaq.github.io/qundaq/. This serves one build under /qundaq/ on its
// own port with its own request log, so the test can prove that the app asks for nothing outside it.
const ORIGIN = 'http://localhost:4175';
const APP = `${ORIGIN}/qundaq/`;
const WEBKIT_SKIP =
  'Playwright WebKit: route()/setOffline() act before the service worker; iOS covered by docs/device-checklist.md';

async function servedPaths(request: APIRequestContext): Promise<string[]> {
  return (await (await request.get(`${ORIGIN}/__log`)).json()) as string[];
}

test('served from /qundaq/, the app loads, caches only its own paths and works offline', async ({
  page,
  context,
  request,
  browserName,
}) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await servedPaths(request); // start from an empty log

  await page.goto(APP);
  await openTab(page, t('tab.settings'));
  const offlineReady = t('settings.offline.ready').split('(')[0]!.trim();
  await expect(page.getByText(new RegExp(offlineReady))).toBeVisible({ timeout: 20_000 });
  const installed = await servedPaths(request);
  expect(installed).toContain('/qundaq/sw.js');
  expect(
    installed.filter((path) => !path.startsWith('/qundaq/')),
    'paths outside /qundaq/',
  ).toEqual([]);
  // The service worker is registered for, and scoped to, the sub-path.
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope),
  ).toBe(APP);

  // From here on the network is gone. The browser may re-check /qundaq/sw.js (see offline.spec.ts);
  // any other request counts as leaked.
  const leaked: string[] = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!(url.origin === ORIGIN && url.pathname === '/qundaq/sw.js')) leaked.push(url.href);
    return route.abort();
  });
  const fresh = await context.newPage();
  await fresh.goto(APP);
  await expect(fresh.getByRole('navigation', { name: t('nav.label') })).toBeVisible();
  expect(await fresh.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(
    `${APP}sw.js`,
  );
  await addBabyInSettings(fresh, 'Ada');
  await openTab(fresh, t('tab.home'));
  await cardAction(fresh, 'diaper').click();
  await fresh
    .getByRole('dialog', { name: t('sheet.diaper.title') })
    .getByRole('button', { name: t('common.save'), exact: true })
    .click();
  await expect(babyCard(fresh, 'Ada')).toContainText(t('diaper.wet'));

  expect(leaked).toEqual([]);
  // The browser's own sw.js update check may reach the server (it bypasses route()); nothing else may.
  const offline = (await servedPaths(request)).filter((path) => path !== '/qundaq/sw.js');
  expect(offline, 'requests that reached the server while offline').toEqual([]);
});
