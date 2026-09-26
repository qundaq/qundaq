import { expect, test } from '@playwright/test';
import { fakeAudio, soundStatus, tile } from './support/audio';
import {
  downloadedText,
  pickBackupFile,
  removeShare,
  stubShare,
  takeBackup,
} from './support/backup';
import { addBabyInSettings, logDiaper, openTab } from './support/tracking';

test('production build ships the strict CSP', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/unsafe-(inline|eval)/);
});

test('using the app triggers no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await fakeAudio(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  for (const name of ['Günlük', 'Özet', 'Sesler', 'Ayarlar']) {
    await nav.getByRole('button', { name, exact: true }).click();
  }
  // Playing a sound, saving a mix, playing it from the list and opening the source list stay inside the
  // policy (no inline styles, same-origin fetch).
  await nav.getByRole('button', { name: 'Sesler', exact: true }).click();
  await tile(page, 'Yağmur').click();
  await expect(soundStatus(page)).toContainText('Çalıyor');
  await page.getByRole('button', { name: 'Karışımı kaydet', exact: true }).click();
  const mixSheet = page.getByRole('dialog', { name: 'Karışımı kaydet' });
  await mixSheet.getByLabel('Karışımın adı').fill('Gece');
  await mixSheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(mixSheet).toBeHidden();
  const mixRow = page.getByRole('listitem').filter({ hasText: 'Gece' });
  await mixRow.getByRole('button', { name: 'Gece karışımını çal', exact: true }).click();
  await expect(soundStatus(page)).toContainText('Çalıyor · Yağmur');
  await nav.getByRole('button', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('button', { name: 'Ses kaynakları', exact: true }).click();
  const sources = page.getByRole('dialog', { name: 'Ses kaynakları' });
  await expect(sources).toContainText('Paul Kellet');
  await sources.getByRole('button', { name: 'Kapat', exact: true }).click();
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('backing up, exporting CSV and restoring trigger no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page);
  const backup = await takeBackup(page);
  await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
  const csv = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
  await csv.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await csv.getByRole('button', { name: 'Tamam', exact: true }).click();
  const restore = await pickBackupFile(page, backup);
  await restore.getByRole('button', { name: 'Tamamen değiştir', exact: true }).click();
  await restore
    .getByRole('checkbox', {
      name: 'Yedeğin bu cihazdaki tüm verilerin yerini alacağını anlıyorum',
    })
    .check();
  await restore.getByRole('button', { name: 'Değiştir', exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText('Geri yüklendi: 1 bebek ve 1 kayıt.');
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('the download fallback for the backup and the CSV triggers no CSP violations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await removeShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page);
  await openTab(page, 'Ayarlar');
  await page.getByRole('button', { name: 'Yedek al', exact: true }).click();
  const backup = page.getByRole('dialog', { name: 'Yedek al' });
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(),
  ]);
  expect(JSON.parse(await downloadedText(json))).toMatchObject({ app: 'qundaq' });
  await backup.getByRole('button', { name: 'Evet', exact: true }).click();
  await backup.getByRole('button', { name: 'Tamam', exact: true }).click();
  await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
  const csv = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
  // One baby, one file: a single "Dosyayı indir".
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    csv.getByRole('button', { name: 'Dosyayı indir', exact: true }).click(),
  ]);
  expect(await downloadedText(file)).toContain('Tarih;Başlangıç;');
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});
