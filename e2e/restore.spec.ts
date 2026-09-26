import { expect, test } from '@playwright/test';
import { clearAppData, pickBackupFile, sharedFiles, stubShare, takeBackup } from './support/backup';
import { addBabyInSettings, babyCard, logDiaper, logRows, openTab, quick } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
});

test('a backup restores into an emptied app', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Can');
  await openTab(page, 'Ana');
  await logDiaper(page, { all: true, at: '2026-09-26T09:00' });
  const backup = await takeBackup(page);

  await clearAppData(page);
  await openTab(page, 'Ana');
  await expect(page.getByText('Başlamak için bir bebek ekleyin.')).toBeVisible();

  // An empty Home offers the restore right away, before any baby is added again.
  await page.getByRole('main').getByLabel('Yedekten geri yükle', { exact: true }).setInputFiles({
    name: 'qundaq-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  const sheet = page.getByRole('dialog', { name: 'Yedekten geri yükle' });
  await expect(sheet).toContainText('Bebekler: Ada, Can');
  await expect(sheet).toContainText('2 kayıt');
  // Nothing on this phone: merging is all there is, so the mode choice is not offered.
  await expect(sheet.getByRole('button', { name: 'Tamamen değiştir' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Geri yüklendi: 2 kayıt eklendi, 0 güncellendi, 0 silindi, 0 taşındı.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ana');
  await expect(babyCard(page, 'Ada')).toContainText('ıslak');
  await expect(babyCard(page, 'Can')).toContainText('ıslak');
  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(2);
});

test('merging into a phone with other data: the preview counts match, and the same baby is recognised', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page, { at: '2026-09-26T08:00' });
  await logDiaper(page, { at: '2026-09-26T09:00' });
  const backup = await takeBackup(page);

  // The phone was wiped; Ada was added again (a new id) with one entry, and Bora is new.
  await clearAppData(page);
  await addBabyInSettings(page, 'ada');
  await addBabyInSettings(page, 'Bora');
  await openTab(page, 'Ana');
  await quick(page, 'Bez').click();
  const diaper = page.getByRole('dialog', { name: 'Bez' });
  await diaper.getByRole('button', { name: 'Bora', exact: true }).click(); // only Ada stays selected
  await diaper.getByLabel('Zaman').fill('2026-09-26T09:30');
  await diaper.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(diaper).toBeHidden();

  const sheet = await pickBackupFile(page, backup);
  await expect(sheet.getByRole('button', { name: 'Birleştir', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('checkbox', { name: 'Yedekteki Ada ile bu cihazdaki ada aynı bebek' })).toBeChecked();
  // The backup's Ada survives in place of this phone's: the same baby, not an added one.
  await expect(sheet).toContainText(
    'BebeklerEklenecek: 0 · Güncellenecek: 0 · Silinecek: 0 · Aynı: 1 · Bu cihazdaki daha yeni olduğu için korunacak: 0',
  );
  await expect(sheet).toContainText(
    'KayıtlarEklenecek: 2 · Güncellenecek: 0 · Silinecek: 0 · Aynı: 0 · Bu cihazdaki daha yeni olduğu için korunacak: 0',
  );
  await expect(sheet).toContainText('1 kayıt Ada altında birleştirilecek.');
  await sheet.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Geri yüklendi: 2 kayıt eklendi, 0 güncellendi, 0 silindi, 1 taşındı.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ana');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(babyCard(page, 'Ada')).toBeVisible();
  await expect(babyCard(page, 'Bora')).toBeVisible();
  await openTab(page, 'Günlük');
  await expect(logRows(page).filter({ hasText: 'Ada' })).toHaveCount(3);
});

test("entries logged on a baby that the other phone combined follow it to the baby kept there", async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page, { at: '2026-09-26T09:00' });
  // The other phone paired this Ada with its own, older Ada and deleted this one; its backup says so.
  const file = JSON.parse(await takeBackup(page));
  const mine = file.babies[0];
  const older = { ...mine, id: 'older-ada', createdAt: mine.createdAt - 86_400_000, updatedAt: mine.createdAt - 86_400_000 };
  file.babies = [{ ...mine, deletedAt: file.exportedAt, updatedAt: file.exportedAt }, older];
  file.events = [];

  const sheet = await pickBackupFile(page, JSON.stringify(file));
  const follow = sheet.getByRole('checkbox', { name: 'Bu cihazdan kaldırılacak Ada: kayıtları Ada altında birleştirilsin' });
  await expect(follow).toBeChecked();
  await expect(sheet).toContainText('Bu cihazdan kaldırılacak bebek: Ada');
  await expect(sheet).toContainText('1 kayıt Ada altında birleştirilecek.');
  // Kept apart, the entry would hide with the deleted baby: the preview says so.
  await follow.uncheck();
  await expect(sheet).toContainText('Ada: bu cihazdaki 1 kayıt bebekle birlikte gizlenecek.');
  await expect(sheet).not.toContainText('birleştirilecek');
  await follow.check();
  await sheet.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Geri yüklendi: 0 kayıt eklendi, 0 güncellendi, 0 silindi, 1 taşındı.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ana');
  await expect(page.getByRole('article')).toHaveCount(1);
  await openTab(page, 'Günlük');
  await expect(logRows(page).filter({ hasText: 'Ada' })).toHaveCount(1);
});

test('replace shows what it would lose, can back up first without losing the choice, and needs the checkbox', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await logDiaper(page, { at: '2026-09-26T08:00' });
  const backup = await takeBackup(page);
  await openTab(page, 'Ana');
  await logDiaper(page, { at: '2026-09-26T09:40' }); // made after the backup

  const sheet = await pickBackupFile(page, backup);
  await sheet.getByRole('button', { name: 'Tamamen değiştir', exact: true }).click();
  await expect(sheet).toContainText('Bu cihazdaki 1 bebek ve 2 kayıt silinip yedektekilerle değiştirilecek.');
  await expect(sheet).toContainText('Yedekten sonra bu cihaza girilen 1 kayıt silinecek (en yenisi: 26 Eyl 09:40).');
  const replace = sheet.getByRole('button', { name: 'Değiştir', exact: true });
  await expect(replace).toBeDisabled();

  // Back up first: the export sheet takes over, and the preview comes back with "Tamamen değiştir" still chosen.
  await sheet.getByRole('button', { name: 'Önce bu cihazın yedeğini al', exact: true }).click();
  const exportSheet = page.getByRole('dialog', { name: 'Yedek al' });
  await exportSheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await exportSheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  await expect(sheet).toBeVisible();
  expect(await sharedFiles(page)).toHaveLength(2);
  await expect(sheet.getByRole('button', { name: 'Tamamen değiştir', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await sheet.getByRole('checkbox', { name: 'Yedeğin bu cihazdaki tüm verilerin yerini alacağını anlıyorum' }).check();
  await replace.click();
  await expect(sheet.getByRole('status')).toHaveText('Geri yüklendi: 1 bebek ve 1 kayıt.');
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(1);
  await expect(logRows(page)).toContainText(['08:00']);
});

test('broken files are refused with the right message, and nothing is written', async ({ page }) => {
  const valid = { app: 'qundaq', schemaVersion: 1, exportedAt: Date.now(), appVersion: '0.1.0', babies: [], events: [], mixes: [], settings: {} };
  const cases: [string, string][] = [
    ['not JSON', 'Bu dosya bir Qundaq yedeği değil.'],
    [JSON.stringify({ ...valid, app: 'another-app' }), 'Bu dosya bir Qundaq yedeği değil.'],
    [JSON.stringify({ ...valid, schemaVersion: 99 }), 'Bu yedek, uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelleyin.'],
  ];
  for (const [text, message] of cases) {
    const sheet = await pickBackupFile(page, text);
    await expect(sheet.getByRole('alert')).toHaveText(message);
    await sheet.getByRole('button', { name: 'Kapat', exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  // One good baby, one good entry and one bad entry: the bad one is named and skipped.
  const T = new Date('2026-09-26T08:00:00+03:00').getTime();
  const baby = { id: 'b1', name: 'Ada', color: '#7cb7ff', archived: false, createdAt: T, updatedAt: T };
  const good = { id: 'e1', type: 'diaper', babyId: 'b1', startAt: T, wet: true, dirty: false, createdAt: T, updatedAt: T };
  const bad = { id: 'e2', type: 'bottle', babyId: 'b1', startAt: T + 60_000, ml: 5000, contents: 'formula', createdAt: T, updatedAt: T };
  const sheet = await pickBackupFile(page, JSON.stringify({ ...valid, babies: [baby], events: [good, bad] }));
  await expect(sheet).toContainText('1 kayıt okunamadı ve atlanacak.');
  await sheet.getByText('Ayrıntılar', { exact: true }).click();
  await expect(sheet.getByRole('listitem')).toHaveText(['26 Eyl 08:01 · Biberon: ayrıntıları geçersiz']);
  await sheet.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Ana');
  await expect(page.getByText('Başlamak için bir bebek ekleyin.')).toBeVisible();
});

test('a running timer in an old backup is stopped at the time of the backup', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await quick(page, 'Uyku').click();
  await page.getByRole('dialog', { name: 'Uyku' }).getByRole('button', { name: 'Başlat', exact: true }).click();
  await expect(babyCard(page, 'Ada')).toContainText('Uyuyor');
  const backup = await takeBackup(page);

  // Two days later, on an emptied phone.
  await clearAppData(page);
  await page.clock.setSystemTime(new Date('2026-09-28T10:00:00+03:00'));
  const sheet = await pickBackupFile(page, backup);
  await expect(sheet).toContainText('Ada · Uyku: sayaç hâlâ sürüyor (başlangıç: 26 Eyl 10:00)');
  await expect(sheet.getByRole('checkbox', { name: 'Yedeğin alındığı anda durdurulsun' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();

  await openTab(page, 'Ana');
  await expect(babyCard(page, 'Ada')).toContainText('Uyanık');
  await expect(babyCard(page, 'Ada').getByRole('button', { name: 'Ada: Uyandı' })).toHaveCount(0);
});
