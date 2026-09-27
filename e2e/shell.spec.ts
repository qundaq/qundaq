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
  await expect(page.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeAttached();
  await expect(nav.getByRole('button', { name: 'Ayarlar', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
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

test('theme: light and system are chosen in Ayarlar, persist, and night mode wins', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name: 'Ayarlar', exact: true })
    .click();
  const theme = page.getByRole('group', { name: 'Tema' });
  await theme.getByRole('button', { name: 'Açık', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f5f8');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name: 'Ayarlar', exact: true })
    .click();
  // A settings toggle saves through an async IndexedDB round trip (like every setting), so its checked
  // state settles a beat after the click; toBeChecked()/not.toBeChecked() retry until it does, unlike
  // check()/uncheck(), which verify only once, right after the click, and would flake on that gap.
  const nightSwitch = page.getByRole('switch', { name: /Gece modu/ });
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
  await page.emulateMedia({ colorScheme: 'dark' });
  await nightSwitch.click();
  await expect(nightSwitch).not.toBeChecked();
  await theme.getByRole('button', { name: 'Sistem', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('every screen starts with the brand row and the tab bar has five labelled icons', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('banner').getByText('Qundaq')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(nav.locator('svg')).toHaveCount(5);
  for (const name of ['Günlük', 'Özet', 'Sesler', 'Ayarlar']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('banner').getByText('Qundaq')).toBeVisible();
  }
});
