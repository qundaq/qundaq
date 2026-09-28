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

test('the settings screen has five labelled sections, each holding its own cards', async ({
  page,
}) => {
  await page
    .getByRole('navigation', { name: t('nav.label') })
    .getByRole('button', { name: t('tab.settings'), exact: true })
    .click();
  for (const key of ['babies', 'appearance', 'sound', 'device', 'about'] as const) {
    // .first(): the "about" section's own heading and its "About" card's title happen to read the
    // same in both locales; the section heading is the first of the two in DOM order.
    await expect(
      page.getByRole('heading', { name: t(`settings.section.${key}`), exact: true }).first(),
    ).toBeVisible();
  }
  // Not just "present somewhere on the page": the theme card's own heading must be nested inside the
  // appearance section, not some other one. Each SettingsSection <section> has its own label as a direct
  // <h2> child (the whole screen is also a <section>, but its direct children are not an <h2>), so
  // `section:has(> h2)` picks out one of the five labelled sections, disambiguated by its label text.
  const sectionLabelled = (label: string) =>
    page.locator('section:has(> h2)').filter({ hasText: label });
  const appearanceSection = sectionLabelled(t('settings.section.appearance'));
  await expect(
    appearanceSection.getByRole('heading', { name: t('settings.theme.title'), exact: true }),
  ).toBeVisible();
  const deviceSection = sectionLabelled(t('settings.section.device'));
  await expect(
    deviceSection.getByRole('heading', { name: t('settings.theme.title'), exact: true }),
  ).toHaveCount(0);
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
