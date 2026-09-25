import { chromium, devices, expect, test } from '@playwright/test';
import { addBabyInSettings, babyCard, openTab } from './support/tracking';

const APP = 'http://localhost:4173/';
const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7'];
const CONTEXT = { ...pixel7, locale: 'tr-TR', serviceWorkers: 'allow' as const };

// offline.spec.ts reopens a page in the same, still running browser. This closes the browser entirely and
// relaunches it from the same profile with the network off, as when the phone restarts in airplane mode.
test('the app opens from a closed browser with the network off, data included', async ({ browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright WebKit: route()/setOffline() act before the service worker; iOS covered by docs/device-checklist.md',
  );
  const profile = test.info().outputPath('profile');

  const first = await chromium.launchPersistentContext(profile, CONTEXT);
  try {
    const page = first.pages()[0] ?? (await first.newPage());
    await page.goto(APP);
    await addBabyInSettings(page, 'Ada');
    await expect(page.getByText(/Çevrimdışı hazır/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await first.close();
  }

  const second = await chromium.launchPersistentContext(profile, { ...CONTEXT, offline: true });
  try {
    const page = second.pages()[0] ?? (await second.newPage());
    await page.goto(APP);
    await expect(page.getByRole('navigation', { name: 'Ana gezinme' })).toBeVisible();
    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada')).toBeVisible();
  } finally {
    await second.close();
  }
});
