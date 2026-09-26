import { expect, test } from '@playwright/test';
import { downloadedText, failNextShare, openExport, removeShare, shareCalls, sharedFiles, stubShare } from './support/backup';
import { addBabyInSettings, logDiaper, openOther, openTab, quick } from './support/tracking';

test.describe('JSON backup', () => {
  test('shares one JSON file with every baby and entry; Ayarlar then shows the backup', async ({ page }) => {
    await stubShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await logDiaper(page);
    await openTab(page, 'Ayarlar');
    await expect(page.getByText('Henüz yedek alınmadı.')).toBeVisible();

    const sheet = await openExport(page);
    await expect(sheet).toContainText('1 bebek · 1 kayıt');
    await expect(sheet).toContainText('Yedek dosyası şifrelenmez.');
    await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText('Yedek paylaşıldı.');

    const [file] = await sharedFiles(page);
    expect(file?.name).toMatch(/^qundaq-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(file?.type).toBe('application/json');
    const backup = JSON.parse(file!.text) as Record<string, unknown> & { babies: { name: string }[]; events: object[] };
    expect(backup).toMatchObject({ app: 'qundaq', schemaVersion: 1, mixes: [], settings: { locale: 'tr', nightMode: false } });
    expect(backup.babies.map((baby) => baby.name)).toEqual(['Ada']);
    expect(backup.events).toHaveLength(1);
    expect(file!.text).not.toContain('"open"');
    expect(file!.text).not.toContain('lastBackupAt');

    await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(/^Son yedek: bugün \(/)).toBeVisible();
  });

  test('a cancelled share changes nothing; a refused one asks for another tap', async ({ page }) => {
    await stubShare(page);
    await page.goto('./');
    let sheet = await openExport(page);
    const share = () => sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true });

    await failNextShare(page, 'AbortError');
    await share().click();
    await expect.poll(() => shareCalls(page)).toBe(1); // the cancelled share has been handled
    await expect(share()).toBeVisible();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(sheet.getByRole('status')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Henüz yedek alınmadı.')).toBeVisible();

    sheet = await openExport(page);
    await failNextShare(page, 'NotAllowedError');
    await share().click();
    await expect(sheet.getByRole('alert')).toHaveText('Paylaşım açılamadı, tekrar dokunun.');
    await share().click();
    await expect(sheet.getByRole('status')).toHaveText('Yedek paylaşıldı.');
    expect(await sharedFiles(page)).toHaveLength(1);
  });

  test('a share that fails in another way offers the download instead', async ({ page }) => {
    await stubShare(page);
    await page.goto('./');
    const sheet = await openExport(page);
    await failNextShare(page, 'DataError');
    await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Dosyayı indir', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true })).toHaveCount(0);
  });

  test('without file sharing the file is downloaded, and it counts only after "Evet"', async ({ page }) => {
    await removeShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    const sheet = await openExport(page);
    const download = sheet.getByRole('button', { name: 'Dosyayı indir', exact: true });

    const [first] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(first.suggestedFilename()).toMatch(/^qundaq-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(JSON.parse(await downloadedText(first))).toMatchObject({ app: 'qundaq', babies: [{ name: 'Ada' }] });
    await expect(sheet).toContainText('Dosya kaydedildi mi?');
    await sheet.getByRole('button', { name: 'Hayır', exact: true }).click();
    await sheet.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Henüz yedek alınmadı.')).toBeVisible();

    await page.getByRole('button', { name: 'Yedek al', exact: true }).click();
    await Promise.all([page.waitForEvent('download'), download.click()]);
    await sheet.getByRole('button', { name: 'Evet', exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText('Yedek kaydedildi.');
    await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
    await expect(page.getByText(/^Son yedek: bugün \(/)).toBeVisible();
  });
});

test.describe('CSV', () => {
  test.use({ timezoneId: 'Europe/Istanbul' });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  });

  test('shares one file per baby with entries, plus pumping, as a Turkish spreadsheet; it is not a backup', async ({ page }) => {
    await stubShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Biberon').click();
    const bottle = page.getByRole('dialog', { name: 'Biberon' });
    await bottle.getByLabel('Zaman').fill('2026-09-26T09:40');
    await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
    await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bottle).toBeHidden();
    const pump = await openOther(page, 'Sağım');
    await pump.getByLabel('Sol (ml)').fill('60');
    await pump.getByLabel('Not (isteğe bağlı)').fill('=akşam; "sol"');
    await pump.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(pump).toBeHidden();

    await openTab(page, 'Ayarlar');
    await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
    // Can has no entries, so no file for Can.
    await expect(sheet).toContainText('2 dosya: qundaq-Ada-2026-09-26.csv, qundaq-Sağım-2026-09-26.csv');
    await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText('Dosyalar paylaşıldı.');

    const files = await sharedFiles(page);
    expect(files.map((file) => [file.name, file.type, file.bom])).toEqual([
      ['qundaq-Ada-2026-09-26.csv', 'text/csv', true],
      ['qundaq-Sağım-2026-09-26.csv', 'text/csv', true],
    ]);
    expect(files[0]!.text).toBe(
      'Tarih;Başlangıç;Bitiş tarihi;Bitiş saati;Süre (dk);Tür;Ayrıntı;Not\r\n2026-09-26;09:40;;;;Biberon;90 ml · Anne sütü;\r\n',
    );
    // The note is quoted (it holds ";" and quotes) and cannot run as a formula.
    expect(files[1]!.text).toContain(`;Sağım;Sol 60 ml;"'=akşam; ""sol"""\r\n`);

    await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
    await expect(page.getByText('Henüz yedek alınmadı.')).toBeVisible();
  });

  test('without file sharing, each file has its own download button', async ({ page }) => {
    await removeShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await logDiaper(page, { all: true });
    await openTab(page, 'Ayarlar');
    await page.getByRole('button', { name: 'CSV olarak dışa aktar', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'CSV olarak dışa aktar' });
    for (const name of ['qundaq-Ada-2026-09-26.csv', 'qundaq-Can-2026-09-26.csv']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        sheet.getByRole('button', { name: `${name} dosyasını indir`, exact: true }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(name);
      expect(await downloadedText(download)).toContain('Tarih;Başlangıç;');
    }
    await expect(sheet).not.toContainText('Dosya kaydedildi mi?');
  });
});
