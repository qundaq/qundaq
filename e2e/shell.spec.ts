import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('shows five tabs and switches screens', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  for (const name of ['Ana', 'Günlük', 'Özet', 'Sesler', 'Ayarlar']) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await nav.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Ayarlar', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('language choice persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('night mode persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
});
