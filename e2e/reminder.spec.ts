import { expect, test } from '@playwright/test';
import { stubShare } from './support/backup';
import { addBabyInSettings, logDiaper, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test('the backup reminder: shown with entries and no backup, snoozed until the next morning, gone after a backup', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-26T22:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  const banner = page.getByRole('region', { name: 'Yedek hatırlatması' });
  await expect(page.getByRole('article', { name: 'Ada' })).toBeVisible();
  await expect(banner).toHaveCount(0); // nothing to lose yet

  await logDiaper(page);
  await expect(banner).toContainText(
    'Henüz yedek alınmadı. Kayıtlar yalnızca bu telefonda duruyor.',
  );
  await banner.getByRole('button', { name: 'Yarın hatırlat', exact: true }).click();
  await expect(banner).toHaveCount(0);

  // Snoozed at 22:00: 09:00 would be only 11 hours later, so it stays hidden until 10:00.
  await page.clock.setSystemTime(new Date('2026-09-27T09:30:00+03:00'));
  await page.reload();
  await expect(page.getByRole('article', { name: 'Ada' })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-09-27T10:01:00+03:00'));
  await page.reload();
  await expect(banner).toBeVisible();

  // Its "Yedek al" opens the export sheet; a finished backup hides it at once.
  await banner.getByRole('button', { name: 'Yedek al', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Yedek al' });
  await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  await expect(banner).toHaveCount(0);

  // Eight days later it is back, and says how old the backup is.
  await page.clock.setSystemTime(new Date('2026-10-05T10:05:00+03:00'));
  await page.reload();
  await expect(banner).toContainText(
    'Son yedek 8 gün önce. Kayıtlar yalnızca bu telefonda duruyor.',
  );
});

test('a CSV export does not count as a backup', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page);
  const banner = page.getByRole('region', { name: 'Yedek hatırlatması' });
  await expect(banner).toBeVisible();
  await openTab(page, 'Ayarlar');
  await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
  await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  await openTab(page, 'Ana');
  await expect(banner).toBeVisible();
});
