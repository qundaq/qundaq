import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { fakeAudio } from './support/audio';
import { addBabyInSettings, cardAction, logDiaper, openTab } from './support/tracking';

test.skip(
  !process.env.QUNDAQ_SCREENSHOTS,
  'baselines are rendered in CI (Linux fonts); set QUNDAQ_SCREENSHOTS=1 to run',
);

const THEMES = [
  { name: 'dark', theme: t('settings.theme.dark'), night: false },
  { name: 'light', theme: t('settings.theme.light'), night: false },
  { name: 'night', theme: t('settings.theme.dark'), night: true },
] as const;

for (const variant of THEMES) {
  test(`screens in ${variant.name}`, async ({ page }) => {
    await fakeAudio(page);
    await page.clock.install({ time: new Date(2026, 8, 26, 21, 30) });
    await page.goto('/');
    // The fake clock ticks forward with real time once installed; freeze it here so "0 minutes", "… ago"
    // and the 30 s tick cannot move between the baseline and the comparison run. Every seeded write
    // below gets its own second of frozen time too: two records sharing one instant break the tie
    // through their (random) id, which is not a rendering detail this spec should depend on.
    const at = (secondsFromStart: number) =>
      page.clock.setFixedTime(new Date(2026, 8, 26, 21, 30, secondsFromStart));
    await at(0);
    await addBabyInSettings(page, 'Ada');
    await at(1);
    await addBabyInSettings(page, 'Cal');
    await page
      .getByRole('group', { name: t('settings.theme.title') })
      .getByRole('button', { name: variant.theme, exact: true })
      .click();
    if (variant.night) {
      const nightSwitch = page.getByRole('switch', { name: new RegExp(t('settings.nightMode')) });
      await nightSwitch.click();
      await expect(nightSwitch).toBeChecked();
    }
    await openTab(page, t('tab.home'));
    // A single baby (the default, "Ada") for both the diaper and the sleep timer: every row then
    // belongs to one baby, so the log's order can never depend on a same-instant tie between babies.
    await at(2);
    await logDiaper(page);
    await at(3);
    await cardAction(page, 'sleep').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await sheet.getByRole('button', { name: t('sheet.startSleep'), exact: true }).click();
    await expect(sheet).toBeHidden();
    // The diaper and "sleep started" toasts (only the latest stays, replacing the other) must be gone
    // before the first screenshot, or a baseline would depend on how much real time a run took.
    await waitForToastGone(page);
    for (const tab of [
      t('tab.home'),
      t('tab.log'),
      t('tab.summary'),
      t('tab.sounds'),
      t('tab.settings'),
    ]) {
      await openTab(page, tab);
      if (tab === t('tab.settings')) {
        const offlineReady = t('settings.offline.ready').split('(')[0]!.trim();
        await expect(page.getByText(new RegExp(offlineReady))).toBeVisible();
      }
      await expect(page).toHaveScreenshot(`${tab}-${variant.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.002,
        mask: [page.getByTestId('app-version'), page.locator('[data-testid="live-text"]')],
      });
    }

    // Two more sheets: the bottle sheet once it has history to show, and a diaper warning colour with
    // its alert.
    await openTab(page, t('tab.home'));
    await cardAction(page, 'bottle').click();
    await page
      .getByRole('dialog', { name: t('sheet.bottle.title') })
      .getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true })
      .click();
    await page
      .getByRole('dialog', { name: t('sheet.bottle.title') })
      .getByRole('button', { name: t('common.save'), exact: true })
      .click();
    await waitForToastGone(page);

    await cardAction(page, 'bottle').click();
    const bottleSheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await expect(bottleSheet.getByText(t('bottle.last', { ml: 90 }))).toBeVisible();
    await expect(page).toHaveScreenshot(`bottle-sheet-${variant.name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.002,
      mask: [page.getByTestId('app-version'), page.locator('[data-testid="live-text"]')],
    });
    await bottleSheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
    await expect(bottleSheet).toBeHidden();

    await cardAction(page, 'diaper').click();
    const diaperSheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await diaperSheet.getByRole('radio', { name: t('diaper.dirty.button'), exact: true }).click();
    await diaperSheet.getByRole('radio', { name: t('stool.color.red'), exact: true }).click();
    await expect(diaperSheet.getByRole('alert')).toBeVisible();
    await expect(page).toHaveScreenshot(`diaper-sheet-${variant.name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.002,
      mask: [page.getByTestId('app-version'), page.locator('[data-testid="live-text"]')],
    });
    await diaperSheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
    await expect(diaperSheet).toBeHidden();
  });
}

/** Waits out an undo toast (TOAST_UNDO_MS) so it never lands in a screenshot. */
async function waitForToastGone(page: Page) {
  await page.clock.runFor(9_000);
  await expect(page.getByRole('status')).toBeEmpty();
}
