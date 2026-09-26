import { expect, test, type Page } from '@playwright/test';
import { babyIdOf, clearAppData, pickBackupFile, putRawEvent, sharedFiles, stubShare } from './support/backup';
import { addBabyInSettings, babyCard, logDiaper, logRows, openRow, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NOW = new Date('2026-09-26T10:00:00+03:00').getTime();
const MINUTE = 60_000;

/**
 * No test hook in the app: a finished breastfeed with no sides, written straight into IndexedDB, makes
 * Home's babyStatus throw (`segments.at(-1)!.side`). Günlük tolerates it (describeEvent reads
 * `segments ?? []`), which is where the user can delete it. Leaves the page on the crashed Home screen.
 */
async function crashHome(page: Page) {
  await page.clock.install({ time: NOW });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page, { at: '2026-09-26T09:00' });
  const babyId = await babyIdOf(page, 'Ada');
  const at = NOW - 30 * MINUTE;
  await putRawEvent(page, { id: 'bad-feed', type: 'breastfeed', babyId, startAt: at, endAt: at + 10 * MINUTE, segments: [], createdAt: at, updatedAt: at });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Bir şeyler ters gitti.' })).toBeVisible();
}

/** The crash screen's "Yedek al"; returns the backup's JSON text. */
async function emergencyBackup(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Yedek al', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Yedek al' });
  await expect(sheet).toContainText('1 bebek · 2 kayıt');
  await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Yedek paylaşıldı.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  await expect(sheet).toBeHidden();
  const [file] = await sharedFiles(page);
  return file!.text;
}

test('a crashing screen shows the fallback; its backup works, and Günlük can remove the bad entry', async ({ page }) => {
  await crashHome(page);
  await expect(page.getByText(/^Diğer sekmeler çalışmaya devam ediyor\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yeniden yükle', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByLabel('Yedekten geri yükle', { exact: true })).toBeVisible();

  const backup = JSON.parse(await emergencyBackup(page)) as { events: { id: string; type: string; segments?: unknown }[] };
  expect(backup.events.map((event) => event.type).sort()).toEqual(['breastfeed', 'diaper']);
  expect(backup.events.find((event) => event.id === 'bad-feed')).toMatchObject({ segments: [] });

  // The other tabs work, and Günlük shows the bad entry, so it can be deleted.
  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(2);
  await openRow(page, 'Emzirme');
  const edit = page.getByRole('dialog', { name: 'Kaydı düzenle · Emzirme' });
  await edit.getByRole('button', { name: 'Sil', exact: true }).click();
  await page.clock.fastForward(1000);
  await edit.getByRole('button', { name: 'Silmek için tekrar dokunun', exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(logRows(page)).toHaveCount(1);

  await openTab(page, 'Ana');
  await expect(babyCard(page, 'Ada')).toContainText('ıslak');
  await expect(page.getByText('Bir şeyler ters gitti.')).toHaveCount(0);
});

test("the crash screen's backup restores its good entries; the bad one is named and skipped", async ({ page }) => {
  await crashHome(page);
  const backup = await emergencyBackup(page);

  await clearAppData(page);
  const sheet = await pickBackupFile(page, backup);
  await expect(sheet).toContainText('1 kayıt okunamadı ve atlanacak.');
  await sheet.getByText('Ayrıntılar', { exact: true }).click();
  await expect(sheet.getByRole('listitem')).toHaveText(['26 Eyl 09:30 · Emzirme: ayrıntıları geçersiz']);
  await sheet.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Geri yüklendi: 1 kayıt eklendi, 0 güncellendi, 0 silindi, 0 taşındı.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ana');
  await expect(babyCard(page, 'Ada')).toContainText('ıslak');
  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(1);
});
