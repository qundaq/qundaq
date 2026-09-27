import { expect, test } from '@playwright/test';
import { t } from './support/i18n';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('shows five tabs and switches screens', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: t('nav.label') });
  for (const name of [
    t('tab.home'),
    t('tab.log'),
    t('tab.summary'),
    t('tab.sounds'),
    t('tab.settings'),
  ]) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await nav.getByRole('button', { name: t('tab.settings'), exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: t('tab.settings') })).toBeAttached();
  await expect(nav.getByRole('button', { name: t('tab.settings'), exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('language choice persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: t('tab.settings'), exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('night mode persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: t('tab.settings'), exact: true }).click();
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
});

test('theme: light and system are chosen in Settings, persist, and night mode wins', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: t('nav.label') })
    .getByRole('button', { name: t('tab.settings'), exact: true })
    .click();
  const theme = page.getByRole('group', { name: t('settings.theme.title') });
  await theme.getByRole('button', { name: t('settings.theme.light'), exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f5f8');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('navigation', { name: t('nav.label') })
    .getByRole('button', { name: t('tab.settings'), exact: true })
    .click();
  // A settings toggle saves through an async IndexedDB round trip (like every setting), so its checked
  // state settles a beat after the click; toBeChecked()/not.toBeChecked() retry until it does, unlike
  // check()/uncheck(), which verify only once, right after the click, and would flake on that gap.
  const nightSwitch = page.getByRole('switch', { name: new RegExp(t('settings.nightMode')) });
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-night', 'true');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
  await page.emulateMedia({ colorScheme: 'dark' });
  await nightSwitch.click();
  await expect(nightSwitch).not.toBeChecked();
  await theme.getByRole('button', { name: t('settings.theme.system'), exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('every screen starts with the brand row and the tab bar has five labelled icons', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('banner').getByText('Qundaq')).toBeVisible();
  const nav = page.getByRole('navigation', { name: t('nav.label') });
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(nav.locator('svg')).toHaveCount(5);
  for (const name of [t('tab.log'), t('tab.summary'), t('tab.sounds'), t('tab.settings')]) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('banner').getByText('Qundaq')).toBeVisible();
  }
});
