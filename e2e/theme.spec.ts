import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { openTab } from './support/tracking';

test('the first paint uses the stored hint before settings load', async ({ page }) => {
  await page.goto('/');
  await openTab(page, t('tab.settings'));
  await page
    .getByRole('group', { name: t('settings.theme.title') })
    .getByRole('button', { name: t('settings.theme.light'), exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('qundaq.theme'))).toBe('light');
  const nightSwitch = page.getByRole('switch', { name: new RegExp(t('settings.nightMode')) });
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(0, 0, 0)',
  );
  // Capture the attribute at DOMContentLoaded, before React has rendered anything.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { __firstPaintTheme: string | undefined }).__firstPaintTheme =
        document.documentElement.dataset.theme;
    });
  });
  await page.reload();
  // main.tsx applies the hint synchronously in the module body; Vite emits that module script as a
  // deferred script in <head>, which runs before DOMContentLoaded.
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __firstPaintTheme?: string }).__firstPaintTheme),
    )
    .toBe('light');
});

test('a storage that throws does not break start-up', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('denied');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: t('nav.label') })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.evaluate(() => {
      try {
        return localStorage === undefined;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});
