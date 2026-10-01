import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { stubShare } from './support/backup';
import { addBabyInSettings, deleteBabyInSettings, logDiaper, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test('the backup reminder: shown with entries and no backup, snoozed until the next morning, gone after a backup', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-26T22:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const banner = page.getByRole('region', { name: t('reminder.label') });
  await expect(page.getByRole('article', { name: 'Ada' })).toBeVisible();
  await expect(banner).toHaveCount(0); // nothing to lose yet

  await logDiaper(page);
  await expect(banner).toContainText(t('reminder.never'));
  await banner.getByRole('button', { name: t('reminder.snooze'), exact: true }).click();
  await expect(banner).toHaveCount(0);

  // Snoozed at 22:00: 09:00 would be only 11 hours later, so it stays hidden until 10:00.
  await page.clock.setSystemTime(new Date('2026-09-27T09:30:00+03:00'));
  await page.reload();
  await expect(page.getByRole('article', { name: 'Ada' })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-09-27T10:01:00+03:00'));
  await page.reload();
  await expect(banner).toBeVisible();

  // Its backup button opens the export sheet; a finished backup hides it at once.
  await banner.getByRole('button', { name: t('export.title'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('export.title') });
  await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await expect(banner).toHaveCount(0);

  // Eight days later it is back, and says how old the backup is.
  await page.clock.setSystemTime(new Date('2026-10-05T10:05:00+03:00'));
  await page.reload();
  await expect(banner).toContainText(t('reminder.since', { ago: t('backup.daysAgo', { n: 8 }) }));
});

test('deleting every baby hides the reminder again, even though their entries stay behind', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page);
  const banner = page.getByRole('region', { name: t('reminder.label') });
  await expect(banner).toBeVisible();

  await openTab(page, t('tab.settings'));
  await deleteBabyInSettings(page, 'Ada', { fakeClock: true });

  await openTab(page, t('tab.home'));
  await expect(page.getByText(t('home.empty'))).toBeVisible();
  // The diaper is still there (deleteBaby keeps entries), so the reminder would otherwise have
  // something to lose; the empty state offers restore instead, so the banner must stay hidden.
  await expect(banner).toHaveCount(0);
});

test('a CSV export does not count as a backup', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page);
  const banner = page.getByRole('region', { name: t('reminder.label') });
  await expect(banner).toBeVisible();
  await openTab(page, t('tab.settings'));
  await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('csv.title') });
  await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await openTab(page, t('tab.home'));
  await expect(banner).toBeVisible();
});
