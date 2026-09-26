import { expect, test, type Page } from '@playwright/test';
import { downloadedText, failNextShare, openExport, pickBackupFile, stubShare, takeBackup } from './support/backup';
import { addBabyInSettings, babyCard, logRows, openRow, openTab } from './support/tracking';

// The browser may re-check the app's own sw.js for updates on navigation. That is the single request
// MANIFESTO.md documents as outside the app's control; it carries no user data. Anything else counts
// as leaked, including an sw.js on any other origin or path.
function isBrowserSwUpdateCheck(url: string): boolean {
  const parsed = new URL(url);
  return parsed.origin === 'http://localhost:4173' && parsed.pathname === '/sw.js';
}
const WEBKIT_SKIP =
  'Playwright WebKit: route()/setOffline() act before the service worker; iOS covered by docs/device-checklist.md';

async function installAndWaitForOfflineReady(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByText(/Çevrimdışı hazır/)).toBeVisible({ timeout: 20_000 });
}

test('shows "offline ready" once the service worker has cached the app', async ({ page }) => {
  await installAndWaitForOfflineReady(page);
});

test('cold-starts with the network disabled', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);
  await context.setOffline(true);
  const fresh = await context.newPage();
  await fresh.goto('./');
  await expect(fresh.getByRole('navigation', { name: 'Ana gezinme' })).toBeVisible();
});

test('makes no network requests after the first load', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);

  const leaked: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    // A download of a file the page made itself (a blob: URL) is not a network request. Chromium does not
    // route those today; should it start to, they must not count as leaked nor be blocked.
    if (url.startsWith('blob:')) return route.continue();
    if (!isBrowserSwUpdateCheck(url)) leaked.push(url);
    return route.abort();
  });

  await stubShare(page); // installed by the reload below
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  for (const name of ['Günlük', 'Özet', 'Sesler', 'Ana', 'Ayarlar']) {
    await nav.getByRole('button', { name, exact: true }).click();
  }

  // The tracking flows must stay on the device too.
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  const card = babyCard(page, 'Ada');
  const quick = (name: string) => page.getByRole('group', { name: 'Hızlı kayıt' }).getByRole('button', { name, exact: true });

  await quick('Bez').click();
  const diaper = page.getByRole('dialog', { name: 'Bez' });
  await diaper.getByRole('button', { name: 'Kirli', exact: true }).click();
  await diaper.getByRole('radio', { name: 'Sarı', exact: true }).click();
  await diaper.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(card).toContainText('ıslak + kirli');

  await quick('Emzir').click();
  await page.getByRole('dialog', { name: 'Emzirme' }).getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(card).toContainText('Emziriyor');
  await card.getByRole('button', { name: /Emzirmeyi bitir/ }).click();
  await expect(card.getByRole('button', { name: /Emzirmeyi bitir/ })).toHaveCount(0);

  await quick('Biberon').click();
  const bottle = page.getByRole('dialog', { name: 'Biberon' });
  await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
  await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(card).toContainText('biberon 90 ml');

  // History, editing, "Diğer" and the summary stay on the device as well.
  await quick('Diğer').click();
  const other = page.getByRole('dialog', { name: 'İlaç' });
  await other.getByLabel('İlaç / vitamin').fill('D vitamini');
  await other.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(other).toBeHidden();

  await openTab(page, 'Günlük');
  await openRow(page, 'Biberon');
  const edit = page.getByRole('dialog', { name: 'Kaydı düzenle · Biberon' });
  await edit.getByLabel('Miktar (ml)').fill('120');
  await edit.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(logRows(page).filter({ hasText: '120 ml' })).toHaveCount(1);
  await expect(logRows(page).filter({ hasText: 'D vitamini' })).toHaveCount(1);

  await openTab(page, 'Özet');
  await expect(page.getByRole('table', { name: 'Son 7 gün' })).toBeVisible();

  // Backup, CSV, the download fallback and restoring stay on the device too: a file goes only where the
  // user's share sheet sends it.
  const backup = await takeBackup(page);
  await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
  const csv = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
  await csv.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await csv.getByRole('button', { name: 'Tamam', exact: true }).click();
  const exportSheet = await openExport(page);
  await failNextShare(page, 'DataError');
  await exportSheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportSheet.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(),
  ]);
  expect(JSON.parse(await downloadedText(download))).toMatchObject({ app: 'qundaq' });
  await exportSheet.getByRole('button', { name: 'Evet', exact: true }).click();
  await exportSheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  const restore = await pickBackupFile(page, backup);
  await restore.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText('Geri yüklendi: 0 kayıt eklendi, 0 güncellendi, 0 silindi, 0 taşındı.');
  await restore.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ayarlar');
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  expect(leaked).toEqual([]);
});
