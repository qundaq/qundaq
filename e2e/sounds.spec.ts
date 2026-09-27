import { expect, test, type Page } from '@playwright/test';
import { fakeAudio, fakeAudioRecord, soundStatus, tile } from './support/audio';
import { clearAppData, pickBackupFile, stubShare, takeBackup } from './support/backup';
import { addBabyInSettings, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NIGHT = new Date('2026-09-26T22:00:00+03:00');

test('two sounds play, the status names them, and the now-playing bar on Home pauses them above the quick actions', async ({
  page,
}) => {
  await fakeAudio(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Sesler');
  await expect(soundStatus(page)).toHaveText('Durdu');
  await expect(page.getByRole('button', { name: 'Çal', exact: true })).toBeDisabled();

  await tile(page, 'Beyaz gürültü').click();
  await expect(tile(page, 'Beyaz gürültü')).toHaveAttribute('aria-pressed', 'true');
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü · 60 dk kaldı');
  // VoiceOver reads the state changes; the countdown stays out of the live region, or it is read every minute.
  await expect(soundStatus(page).locator('[aria-live="polite"]')).toHaveText(
    'Çalıyor · Beyaz gürültü',
  );
  await expect(page.getByLabel('Beyaz gürültü seviyesi')).toHaveValue('0.7');
  await tile(page, 'Yağmur').click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü + Yağmur · 60 dk kaldı');
  // Both loops generated (the status does not wait for them): one context, resumed in the tap, two sources.
  await expect(tile(page, 'Beyaz gürültü')).not.toContainText('Hazırlanıyor…');
  await expect(tile(page, 'Yağmur')).not.toContainText('Hazırlanıyor…');
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 1, resumes: 1, sources: 2 });

  // A seventh sound is refused with a message.
  for (const name of ['Pembe gürültü', 'Kahverengi gürültü', 'Dalgalar', 'Rüzgâr'])
    await tile(page, name).click();
  await tile(page, 'Şşş').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'En fazla 6 ses birlikte çalabilir.' }),
  ).toHaveText('En fazla 6 ses birlikte çalabilir.');
  await expect(tile(page, 'Şşş')).toHaveAttribute('aria-pressed', 'false');

  await openTab(page, 'Ana');
  const bar = page.getByRole('region', { name: 'Çalan ses' });
  await expect(bar).toContainText('Çalıyor · Beyaz gürültü + Yağmur');
  const quick = await page.getByRole('group', { name: 'Hızlı kayıt' }).boundingBox();
  const barBox = await bar.boundingBox();
  expect(quick!.y + quick!.height).toBeLessThanOrEqual(barBox!.y + 1);
  await bar.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await expect(bar).toContainText('Duraklatıldı');
  await bar.getByRole('button', { name: 'Çal', exact: true }).click();
  await expect(bar).toContainText('Çalıyor');
  await bar.getByRole('button', { name: /Çalıyor/ }).click(); // the text opens the Sesler tab
  await expect(page.getByRole('heading', { level: 1, name: 'Sesler' })).toBeAttached();
  await expect(bar).toHaveCount(0);
});

test('the 15-minute timer counts down and stops the sound; play restarts it with the same chip; the selection survives a reload', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, 'Sesler');
  await expect(page.getByRole('radio', { name: '60 dk', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: '15 dk', exact: true }).click();
  await tile(page, 'Beyaz gürültü').click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü · 15 dk kaldı');
  await page.getByLabel('Ses seviyesi', { exact: true }).fill('0.3');

  await page.clock.fastForward(14 * 60_000);
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü · 1 dk kaldı');
  // Pausing does not stop the countdown.
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await expect(soundStatus(page)).toHaveText('Duraklatıldı · 1 dk kaldı');
  await page.clock.fastForward(70_000);
  await expect(soundStatus(page)).toHaveText('Durdu');
  await expect(tile(page, 'Beyaz gürültü')).toHaveAttribute('aria-pressed', 'true');
  expect(await fakeAudioRecord(page)).toMatchObject({ suspends: 1 });

  await page.getByRole('button', { name: 'Çal', exact: true }).click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü · 15 dk kaldı');
  await page.getByRole('radio', { name: 'Zamanlayıcı yok', exact: true }).click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü');
  await page.clock.fastForward(60 * 60_000);
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü');

  // The selection, the master and the chip come back after a reload; nothing plays by itself.
  await page.reload();
  await openTab(page, 'Sesler');
  await expect(soundStatus(page)).toHaveText('Durdu');
  await expect(tile(page, 'Beyaz gürültü')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Ses seviyesi', { exact: true })).toHaveValue('0.3');
  await expect(page.getByRole('radio', { name: 'Zamanlayıcı yok', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 0 });
});

test('a mix is saved, plays after a reload from the list, and can be renamed and deleted with two taps', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, 'Sesler');
  await expect(page.getByRole('button', { name: 'Karışımı kaydet', exact: true })).toBeDisabled();
  await tile(page, 'Beyaz gürültü').click();
  await tile(page, 'Yağmur').click();
  await page.getByLabel('Yağmur seviyesi').fill('0.4');
  await page.getByRole('button', { name: 'Karışımı kaydet', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Karışımı kaydet' });
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Bir isim girin.');
  await sheet.getByLabel('Karışımın adı').fill('Gece');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: 'Gece' });
  await expect(row).toContainText('Beyaz gürültü + Yağmur');

  await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await tile(page, 'Beyaz gürültü').click(); // off while paused: the selection changes, nothing starts
  await expect(soundStatus(page)).toHaveText('Duraklatıldı · 60 dk kaldı');
  await page.reload();
  await openTab(page, 'Sesler');
  await expect(soundStatus(page)).toHaveText('Durdu');
  await page.getByRole('button', { name: 'Gece karışımını çal', exact: true }).click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Beyaz gürültü + Yağmur · 60 dk kaldı');
  await expect(page.getByLabel('Yağmur seviyesi')).toHaveValue('0.4');

  await row.getByRole('button', { name: 'Gece: Yeniden adlandır', exact: true }).click();
  const rename = page.getByRole('dialog', { name: 'Karışımı yeniden adlandır' });
  await rename.getByLabel('Karışımın adı').fill('Derin uyku');
  await rename.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(rename).toBeHidden();
  const renamed = page.getByRole('listitem').filter({ hasText: 'Derin uyku' });
  await expect(renamed).toBeVisible();
  await renamed.getByRole('button', { name: 'Derin uyku: Sil', exact: true }).click();
  await page.clock.fastForward(1000);
  await renamed
    .getByRole('button', { name: 'Derin uyku: Silmek için tekrar dokunun', exact: true })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Derin uyku' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Kayıtlı karışımlar' })).toHaveCount(0);
  await expect(soundStatus(page)).toContainText('Çalıyor'); // deleting the mix leaves the sound alone
});

test('on a 320 px screen a mix row keeps its name readable and 16 px between rename and delete', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, 'Sesler');
  await tile(page, 'Beyaz gürültü').click();
  await page.getByRole('button', { name: 'Karışımı kaydet', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Karışımı kaydet' });
  await sheet.getByLabel('Karışımın adı').fill('Gece');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: 'Gece' });
  const name = (await row
    .getByRole('button', { name: 'Gece karışımını çal', exact: true })
    .boundingBox())!;
  const rename = (await row
    .getByRole('button', { name: 'Gece: Yeniden adlandır', exact: true })
    .boundingBox())!;
  const remove = row.getByRole('button', { name: /^Gece: Sil/ });
  const check = async () => {
    const box = (await remove.boundingBox())!;
    const apart = Math.max(
      box.x - (rename.x + rename.width),
      rename.x - (box.x + box.width),
      box.y - (rename.y + rename.height),
      rename.y - (box.y + box.height),
    );
    expect(apart).toBeGreaterThanOrEqual(16);
  };
  await check();
  expect(name.width).toBeGreaterThanOrEqual(200);
  await remove.click(); // armed: the longer "Silmek için tekrar dokunun" still keeps its distance
  await expect(remove).toHaveAccessibleName('Gece: Silmek için tekrar dokunun');
  await check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('a saved mix travels in the backup and comes back in a restore', async ({ page }) => {
  await fakeAudio(page);
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Sesler');
  await tile(page, 'Şşş').click();
  await page.getByRole('button', { name: 'Karışımı kaydet', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Karışımı kaydet' });
  await sheet.getByLabel('Karışımın adı').fill('Gece');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();
  const backup = await takeBackup(page);
  const parsed = JSON.parse(backup) as {
    schemaVersion: number;
    mixes: { name: string; layers: unknown[] }[];
  };
  expect(parsed.schemaVersion).toBe(2);
  expect(parsed.mixes).toEqual([
    {
      id: expect.any(String),
      name: 'Gece',
      layers: [{ soundId: 'shush', gain: 0.7 }],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    },
  ]);
  expect(backup).not.toContain('volumeCap');
  expect(backup).not.toContain('lastSound');

  await clearAppData(page);
  const restore = await pickBackupFile(page, backup);
  const mixesRow = restore
    .getByTestId('import-counts')
    .locator('> div')
    .filter({ hasText: 'Karışımlar' });
  await expect(mixesRow).toContainText('Eklenecek: 1 · Güncellenecek: 0 · Silinecek: 0 · Aynı: 0');
  await restore.getByRole('button', { name: 'Geri yükle', exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText(
    'Geri yüklendi: 0 kayıt eklendi, 0 güncellendi, 0 silindi, 0 taşındı.',
  );
  await restore.getByRole('button', { name: 'Tamam', exact: true }).click();
  await openTab(page, 'Sesler');
  await expect(page.getByRole('listitem').filter({ hasText: 'Gece' })).toContainText('Şşş');
  await page.getByRole('button', { name: 'Gece karışımını çal', exact: true }).click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Şşş · 60 dk kaldı');
});

test('raising the cap warns and never makes the sound louder; the sound sources open in-app', async ({
  page,
}) => {
  // A paused clock: the selection's persist timer and the cap's save fire only when the test says so.
  await page.clock.install({ time: NIGHT });
  await page.clock.pauseAt(new Date(NIGHT.getTime() + 60_000));
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, 'Sesler');
  await tile(page, 'Beyaz gürültü').click();
  await expect(soundStatus(page)).toContainText('Çalıyor');
  await expect(page.getByLabel('Ses seviyesi', { exact: true })).toHaveValue('0.6');
  await expect(page.getByText('Telefonu yataktan uzak tutun, sesi kısık tutun.')).toBeVisible();

  await openTab(page, 'Ayarlar');
  const cap = page.getByLabel('Ses güvenlik sınırı');
  await expect(cap).toHaveValue('0.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The cap's write waits behind another connection while the selection's persist timer (set by the tile
  // tap, master 0.6) comes due: whatever that timer writes lands after the cap, so it must be the lowered master.
  await holdSettingsWrites(page);
  await cap.fill('1');
  await expect(page.getByRole('alert')).toContainText(
    'Telefonu bebeğin yatağına koymayın; en az 2 metre uzakta tutun',
  );
  await page.clock.runFor(1500);
  await releaseSettingsWrites(page);
  // The master slider drops so that the sound stays as loud as it was (R1); the headroom is there to be used.
  await openTab(page, 'Sesler');
  await expect(page.getByLabel('Ses seviyesi', { exact: true })).toHaveValue('0.3');
  await expect(soundStatus(page)).toContainText('Çalıyor');
  expect(await storedCapAndMaster(page)).toEqual({ volumeCap: 1, master: 0.3 });
  // A launch right after restores them as a pair.
  await page.reload();
  await openTab(page, 'Sesler');
  await expect(page.getByLabel('Ses seviyesi', { exact: true })).toHaveValue('0.3');
  await openTab(page, 'Ayarlar');
  await expect(cap).toHaveValue('1');

  await expect(page.getByRole('alert')).toBeVisible();
  await cap.fill('0.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openTab(page, 'Ana'); // leaving the card saves a move that is still pending
  await openTab(page, 'Ayarlar');
  await expect(cap).toHaveValue('0.5');
  await page.reload();
  await openTab(page, 'Ayarlar');
  await expect(cap).toHaveValue('0.5');

  await page.getByRole('button', { name: 'Ses kaynakları', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Ses kaynakları' });
  await expect(sheet).toContainText('| pink | Pembe gürültü / Pink noise |');
  await expect(sheet).toContainText('Paul Kellet');
  await sheet.getByRole('button', { name: 'Kapat', exact: true }).click();
  await expect(sheet).toBeHidden();
});

test('a lower cap chosen while the previous move is still being saved is kept', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await page.clock.pauseAt(new Date(NIGHT.getTime() + 60_000));
  await page.goto('./');
  await openTab(page, 'Ayarlar');
  const cap = page.getByLabel('Ses güvenlik sınırı');
  await expect(cap).toHaveValue('0.5');
  // The first move's save starts and waits; the finger moves on before it lands.
  await holdSettingsWrites(page);
  await cap.fill('0.4');
  await page.clock.runFor(300);
  await cap.fill('0.3');
  await releaseSettingsWrites(page);
  await expect.poll(() => storedCapAndMaster(page)).toMatchObject({ volumeCap: 0.4 });
  await expect(cap).toHaveValue('0.3');
  await page.clock.runFor(300);
  await expect.poll(() => storedCapAndMaster(page)).toMatchObject({ volumeCap: 0.3 });
  await expect(cap).toHaveValue('0.3');
});

test('the real AudioContext builds the graph and plays without errors', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'One real-context check is enough; headless WebKit on the CI runner may not run Web Audio (R11)',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  await openTab(page, 'Sesler');
  await tile(page, 'Kalp atışı').click();
  await tile(page, 'Yağmur').click();
  await expect(soundStatus(page)).toHaveText('Çalıyor · Kalp atışı + Yağmur · 60 dk kaldı');
  await expect(tile(page, 'Yağmur')).not.toContainText('Hazırlanıyor…');
  await page.getByLabel('Yağmur seviyesi').fill('0.2');
  await page.getByRole('radio', { name: '15 dk', exact: true }).click();
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
  await expect(soundStatus(page)).toContainText('Duraklatıldı');
  await page.getByRole('button', { name: 'Çal', exact: true }).click();
  await expect(soundStatus(page)).toContainText('Çalıyor');
  expect(await page.evaluate(() => 'AudioContext' in window && !('__fakeAudio' in window))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

/** A second connection holds a read-write transaction on the settings, so the app's writes queue behind it. */
function holdSettingsWrites(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('qundaq');
        open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
        open.onsuccess = () => {
          const store = open.result.transaction('settings', 'readwrite').objectStore('settings');
          const hold = () => {
            if (!(window as unknown as { __release?: boolean }).__release)
              store.get('none').onsuccess = hold;
          };
          hold();
          resolve();
        };
      }),
  );
}

function releaseSettingsWrites(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __release?: boolean }).__release = true;
  });
}

/**
 * The stored cap and master, read in a transaction opened after every write the app has queued, so it sees
 * them all (IndexedDB runs overlapping transactions in the order they were created).
 */
function storedCapAndMaster(page: Page): Promise<{ volumeCap: unknown; master: unknown }> {
  return page.evaluate(
    () =>
      new Promise<{ volumeCap: unknown; master: unknown }>((resolve, reject) => {
        const open = indexedDB.open('qundaq');
        open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const getAll = db.transaction('settings', 'readonly').objectStore('settings').getAll();
          getAll.onsuccess = () => {
            db.close();
            const [row] = getAll.result as {
              volumeCap?: unknown;
              lastSound?: { master?: unknown };
            }[];
            resolve({ volumeCap: row?.volumeCap, master: row?.lastSound?.master });
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
  );
}
