import { expect, test } from '@playwright/test';
import { fakeAudio } from './support/audio';
import { addBabyInSettings, logDiaper, openTab, quick } from './support/tracking';

test.skip(
  !process.env.QUNDAQ_SCREENSHOTS,
  'baselines are rendered in CI (Linux fonts); set QUNDAQ_SCREENSHOTS=1 to run',
);

const THEMES = [
  { name: 'dark', theme: 'Koyu', night: false },
  { name: 'light', theme: 'Açık', night: false },
  { name: 'night', theme: 'Koyu', night: true },
] as const;

for (const variant of THEMES) {
  test(`screens in ${variant.name}`, async ({ page }) => {
    await fakeAudio(page);
    await page.clock.install({ time: new Date(2026, 8, 26, 21, 30) });
    await page.goto('/');
    // The fake clock ticks forward with real time once installed; freeze it here so "0 dk", "… önce"
    // and the 30 s tick cannot move between the baseline and the comparison run. Every seeded write
    // below gets its own second of frozen time too: two records sharing one instant break the tie
    // through their (random) id, which is not a rendering detail this spec should depend on.
    const at = (secondsFromStart: number) =>
      page.clock.setFixedTime(new Date(2026, 8, 26, 21, 30, secondsFromStart));
    await at(0);
    await addBabyInSettings(page, 'Ada');
    await at(1);
    await addBabyInSettings(page, 'Can');
    await page
      .getByRole('group', { name: 'Tema' })
      .getByRole('button', { name: variant.theme, exact: true })
      .click();
    if (variant.night) {
      const nightSwitch = page.getByRole('switch', { name: /Gece modu/ });
      await nightSwitch.click();
      await expect(nightSwitch).toBeChecked();
    }
    await openTab(page, 'Ana');
    // A single baby (the default, "Ada") for both the diaper and the sleep timer: every row then
    // belongs to one baby, so Günlük's order can never depend on a same-instant tie between babies.
    await at(2);
    await logDiaper(page);
    await at(3);
    await quick(page, 'Uyku').click();
    const sheet = page.getByRole('dialog', { name: 'Uyku' });
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click();
    await expect(sheet).toBeHidden();
    for (const tab of ['Ana', 'Günlük', 'Özet', 'Sesler', 'Ayarlar'] as const) {
      await openTab(page, tab);
      if (tab === 'Ayarlar') await expect(page.getByText(/Çevrimdışı hazır/)).toBeVisible();
      await expect(page).toHaveScreenshot(`${tab}-${variant.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.002,
        mask: [page.getByTestId('app-version'), page.locator('[data-testid="live-text"]')],
      });
    }
  });
}
