import { expect, test } from '@playwright/test';
import { addBabyInSettings, babyCard, openTab, readEvents } from './support/tracking';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test.describe('babies', () => {
  test('first run shows an empty state and adds a baby from Home', async ({ page }) => {
    await expect(page.getByText('Başlamak için bir bebek ekleyin.')).toBeVisible();
    await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Bebek ekle' });
    await dialog.getByLabel('İsim').fill('Ada');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toBeVisible();
  });

  test('a blank name is refused with a message', async ({ page }) => {
    await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Bebek ekle' });
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Bir isim girin.');
    await expect(dialog).toBeVisible();
  });

  test('a birth date can be cleared', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    const row = page.getByRole('listitem').filter({ hasText: 'Ada' });
    await row.getByRole('button', { name: 'Düzenle' }).click();
    let dialog = page.getByRole('dialog', { name: 'Bebeği düzenle' });
    await dialog.getByLabel('Doğum tarihi').fill('2026-09-01');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dialog).toBeHidden();

    await row.getByRole('button', { name: 'Düzenle' }).click();
    dialog = page.getByRole('dialog', { name: 'Bebeği düzenle' });
    await expect(dialog.getByLabel('Doğum tarihi')).toHaveValue('2026-09-01');
    await dialog.getByLabel('Doğum tarihi').fill('');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dialog).toBeHidden();

    await row.getByRole('button', { name: 'Düzenle' }).click();
    dialog = page.getByRole('dialog', { name: 'Bebeği düzenle' });
    await expect(dialog.getByLabel('Doğum tarihi')).toHaveValue('');
  });

  test('babies can be renamed and deleted in Settings', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');

    await page
      .getByRole('listitem')
      .filter({ hasText: 'Ada' })
      .getByRole('button', { name: 'Düzenle' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Bebeği düzenle' });
    await dialog.getByLabel('İsim').fill('Ada Nur');
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Ada Nur' })).toBeVisible();

    page.once('dialog', (confirm) => void confirm.accept());
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Can' })
      .getByRole('button', { name: 'Sil' })
      .click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Can' })).toHaveCount(0);

    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada Nur')).toBeVisible();
    await expect(babyCard(page, 'Can')).toHaveCount(0);
  });
});

test('a failure to read the data is shown, not swallowed', async ({ page }) => {
  await page.addInitScript(() => {
    // Break every index read (the baby list is read through the createdAt index).
    IDBIndex.prototype.getAll = function () {
      throw new DOMException('Simulated read failure', 'UnknownError');
    };
    IDBIndex.prototype.openCursor = function () {
      throw new DOMException('Simulated read failure', 'UnknownError');
    };
  });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    /Veriler yüklenemedi\. Uygulamayı kapatıp yeniden açın\./,
  );
});

function quick(page: import('@playwright/test').Page, name: string) {
  return page
    .getByRole('group', { name: 'Hızlı kayıt' })
    .getByRole('button', { name, exact: true });
}

function countDiapers(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('events', 'readonly');
          const getAll = tx.objectStore('events').getAll();
          getAll.onsuccess = () => {
            const events = getAll.result as Array<{ type: string }>;
            db.close();
            resolve(events.filter((event) => event.type === 'diaper').length);
          };
          getAll.onerror = () => reject(getAll.error);
        };
      }),
  );
}

test.describe('diapers', () => {
  test('a dirty diaper with a pale stool shows the biliary-atresia warning and lands on the card', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Kirli', exact: true }).click();
    await sheet.getByRole('radio', { name: 'Beyaz', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('biliyer atrezi');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · ıslak + kirli');
  });

  test('two submits in the same instant store only one diaper', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    // Both submits run before React can re-render, so a guard kept only in state would let both through.
    await sheet.locator('form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(sheet).toBeHidden();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · ıslak');
    expect(await countDiapers(page)).toBe(1);
  });

  test('a sheet left open while the phone was locked still logs at the moment of saving', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T03:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await page.clock.fastForward('20:00');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · ıslak');
  });

  test('a time the user picked is kept, and "Şimdi" goes back to now', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T03:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    let sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByLabel('Zaman').fill('2026-09-25T02:15');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('45 dk önce · ıslak');

    await quick(page, 'Bez').click();
    sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByLabel('Zaman').fill('2026-09-25T02:30');
    await sheet.getByRole('button', { name: 'Şimdi', exact: true }).click();
    await page.clock.fastForward('05:00');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · ıslak');
  });

  test('"All" logs the same diaper for every baby', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Hepsi', exact: true }).click();
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · ıslak');
    await expect(babyCard(page, 'Can')).toContainText('az önce · ıslak');
  });

  test('colored swatches and cards cause no CSP violations', async ({ page }) => {
    await page.addInitScript(() => {
      const store: string[] = [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
      document.addEventListener('securitypolicyviolation', (e) =>
        store.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Kirli', exact: true }).click();
    await sheet.getByRole('radio', { name: 'Sarı', exact: true }).click();
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('kirli');
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations).toEqual([]);
  });

  test('double-clicking "Kaydet" stores only one diaper', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).dblclick();
    await expect(sheet).toBeHidden();

    const diaperCount = await countDiapers(page);
    expect(diaperCount).toBe(1);
  });
});

test.describe('timers and feeds', () => {
  test('breastfeeding timer: start on the left, switch, finish', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');

    await quick(page, 'Emzir').click();
    const sheet = page.getByRole('dialog', { name: 'Emzirme' });
    await sheet.getByRole('button', { name: 'Sol', exact: true }).click();
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('Emziriyor · sol · 0 dk');

    await page.clock.fastForward('06:00');
    await expect(card).toContainText('Emziriyor · sol · 6 dk');
    await card.getByRole('button', { name: 'Taraf değiştir' }).click();
    await expect(card).toContainText('Emziriyor · sağ');

    await page.clock.fastForward('04:00');
    await card.getByRole('button', { name: /Emzirmeyi bitir/ }).click();
    await expect(card).toContainText('10 dk önce · sağ');
    await expect(card.getByRole('button', { name: /Emzirmeyi bitir/ })).toHaveCount(0);
  });

  test('double-tapping "Emzirmeyi bitir" shows no error and finishes the feed', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    await page
      .getByRole('dialog', { name: 'Emzirme' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('Emziriyor · sol');

    await page.clock.fastForward('05:00');
    await card.getByRole('button', { name: /Emzirmeyi bitir/ }).dblclick();
    await expect(card).toContainText('5 dk önce · sol');
    await expect(card.getByRole('button', { name: /Emzirmeyi bitir/ })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('double-tapping "Taraf değiştir" switches only once', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    const sheet = page.getByRole('dialog', { name: 'Emzirme' });
    await sheet.getByRole('button', { name: 'Sol', exact: true }).click();
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('Emziriyor · sol');

    await page.clock.fastForward('03:00');
    await card.getByRole('button', { name: 'Taraf değiştir' }).dblclick();
    await expect(card).toContainText('Emziriyor · sağ');
    // Let any late second write land before checking it did not flip back.
    await page.clock.fastForward('00:10');
    await expect(card).toContainText('Emziriyor · sağ');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a feed and a sleep running together get their own rows; finishing the feed keeps the sleep', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    await page
      .getByRole('dialog', { name: 'Uyku' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    await quick(page, 'Emzir').click();
    await page
      .getByRole('dialog', { name: 'Emzirme' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('Emziriyor · sol');
    await expect(card).toContainText('Uyuyor');

    // Every timer button names the baby, so a screen reader never has to guess which twin it is for.
    const switchSide = card.getByRole('button', { name: 'Ada: Taraf değiştir', exact: true });
    const finishFeed = card.getByRole('button', { name: 'Ada: Emzirmeyi bitir', exact: true });
    const wakeUp = card.getByRole('button', { name: 'Ada: Uyandı', exact: true });
    await expect(switchSide).toHaveText('Taraf değiştir');
    await expect(finishFeed).toHaveText('Emzirmeyi bitir');
    await expect(wakeUp).toHaveText('Uyandı');

    const feedRow = card
      .locator('.timer-row')
      .filter({ has: page.getByRole('button', { name: 'Ada: Emzirmeyi bitir' }) });
    const sleepRow = card
      .locator('.timer-row')
      .filter({ has: page.getByRole('button', { name: 'Ada: Uyandı' }) });
    await expect(feedRow).toBeVisible();
    await expect(sleepRow).toBeVisible();
    await expect(feedRow.getByRole('button')).toHaveCount(2);
    await expect(sleepRow.getByRole('button')).toHaveCount(1);

    const [a, b, c] = await Promise.all([
      switchSide.boundingBox(),
      finishFeed.boundingBox(),
      wakeUp.boundingBox(),
    ]);
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(16);
    expect(c!.y - (b!.y + b!.height)).toBeGreaterThanOrEqual(16);
    for (const box of [a!, b!, c!]) expect(box.height).toBeGreaterThanOrEqual(48);

    await finishFeed.click();
    await expect(finishFeed).toHaveCount(0);
    await expect(card).toContainText('Uyuyor');
    await expect(wakeUp).toBeVisible();
  });

  test('a running sleep survives a reload and can be ended', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    await page
      .getByRole('dialog', { name: 'Uyku' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    await expect(babyCard(page, 'Ada')).toContainText('Uyuyor · 0 dk');

    await page.reload();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('Uyuyor');
    await card.getByRole('button', { name: 'Uyandı' }).click();
    await expect(card).toContainText('Uyanık · 0 dk');
  });

  test('a second sleep cannot start while the baby is asleep', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    await page
      .getByRole('dialog', { name: 'Uyku' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    await quick(page, 'Uyku').click();
    const sheet = page.getByRole('dialog', { name: 'Uyku' });
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Ada için zaten devam eden bir kayıt var.');
  });

  test('a bottle for all babies at once', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Biberon').click();
    const sheet = page.getByRole('dialog', { name: 'Biberon' });
    await sheet.getByRole('button', { name: 'Hepsi', exact: true }).click();
    await sheet.getByRole('button', { name: '90 ml', exact: true }).click();
    await sheet.getByRole('button', { name: 'Mama', exact: true }).click();
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('az önce · biberon 90 ml');
    await expect(babyCard(page, 'Can')).toContainText('az önce · biberon 90 ml');
  });

  test('a feed with a duration is saved as finished, ending at the chosen time', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    const sheet = page.getByRole('dialog', { name: 'Emzirme' });
    await sheet.getByRole('button', { name: 'Sağ', exact: true }).click();
    await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('15');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText('15 dk önce · sağ');
    await expect(card.getByRole('button', { name: /Emzirmeyi bitir/ })).toHaveCount(0);
  });

  test('a bottle without an amount is refused', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Biberon').click();
    const sheet = page.getByRole('dialog', { name: 'Biberon' });
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Geçerli bir miktar girin (1–1000 ml).');
  });

  test('"Hepsi" names the baby that is already asleep', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    let sheet = page.getByRole('dialog', { name: 'Uyku' });
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click(); // Ada, the default
    await expect(sheet).toBeHidden();

    await quick(page, 'Uyku').click();
    sheet = page.getByRole('dialog', { name: 'Uyku' });
    await sheet.getByRole('button', { name: 'Hepsi', exact: true }).click();
    await sheet.getByRole('button', { name: 'Başlat', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Ada için zaten devam eden bir kayıt var.');
  });

  test('a feed longer than 4 hours is refused', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    const sheet = page.getByRole('dialog', { name: 'Emzirme' });
    await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('300');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(
      'Süre çok uzun: uyku en fazla 24 saat, emzirme en fazla 4 saat olabilir.',
    );
  });
});

test.describe('sheet defaults and saved fields', () => {
  test('the sheet preselects the babies used last time, also after a reload', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    let sheet = page.getByRole('dialog', { name: 'Bez' });
    const chip = (name: string) => sheet.getByRole('button', { name, exact: true });
    await expect(chip('Ada')).toHaveAttribute('aria-pressed', 'true');
    await chip('Can').click();
    await chip('Ada').click();
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();

    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await quick(page, 'Bez').click();
      sheet = page.getByRole('dialog', { name: 'Bez' });
      await expect(chip('Can')).toHaveAttribute('aria-pressed', 'true');
      await expect(chip('Ada')).toHaveAttribute('aria-pressed', 'false');
      await sheet.getByRole('button', { name: 'Vazgeç', exact: true }).click();
      await expect(sheet).toBeHidden();
    }
  });

  test('turning "Kirli" off again saves no stool details', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Kirli', exact: true }).click();
    await sheet.getByRole('radio', { name: 'Beyaz', exact: true }).click();
    await sheet.getByRole('button', { name: 'Sulu', exact: true }).click();
    await sheet.getByRole('button', { name: 'Kirli', exact: true }).click();
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();

    const events = await readEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'diaper', wet: true, dirty: false });
    expect(events[0]).not.toHaveProperty('stoolColor');
    expect(events[0]).not.toHaveProperty('consistency');
  });

  test('stool and baby colors are native radio buttons', async ({ page }) => {
    await openTab(page, 'Ayarlar');
    await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Bebek ekle' });
    // Real <input type="radio">, one group name, so the arrow keys move the choice natively.
    const colorRadios = form.locator('input[type="radio"]');
    await expect(colorRadios).toHaveCount(6);
    expect(
      await colorRadios.evaluateAll(
        (els) => new Set(els.map((el) => (el as HTMLInputElement).name)).size,
      ),
    ).toBe(1);
    await form.getByRole('radio', { name: 'Pembe', exact: true }).check();
    await expect(form.getByRole('radio', { name: 'Pembe', exact: true })).toBeChecked();
    await form.getByRole('radio', { name: 'Pembe', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(form.getByRole('radio', { name: 'Yeşil', exact: true })).toBeChecked();
    await form.getByLabel('İsim').fill('Ada');
    await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(form).toBeHidden();

    await openTab(page, 'Ana');
    await quick(page, 'Bez').click();
    const sheet = page.getByRole('dialog', { name: 'Bez' });
    await sheet.getByRole('button', { name: 'Kirli', exact: true }).click();
    const stoolRadios = sheet.locator('input[type="radio"]');
    await expect(stoolRadios).toHaveCount(9);
    expect(
      await stoolRadios.evaluateAll(
        (els) => new Set(els.map((el) => (el as HTMLInputElement).name)).size,
      ),
    ).toBe(1);
    await sheet.getByRole('radio', { name: 'Hardal', exact: true }).check();
    await expect(sheet.getByRole('radio', { name: 'Hardal', exact: true })).toBeChecked();
    await expect(sheet.getByRole('radio', { name: 'Sarı', exact: true })).not.toBeChecked();
  });

  test('a closing sheet keeps its title and form until it is gone', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    // Record every committed state in which an open sheet has no form or an empty title.
    await page.evaluate(() => {
      const empty: string[] = [];
      (window as unknown as { __emptySheets: string[] }).__emptySheets = empty;
      new MutationObserver(() => {
        for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog.sheet')) {
          const title = dialog.querySelector('h2')?.textContent ?? '';
          if (dialog.open && (!dialog.querySelector('form') || title === '')) empty.push(title);
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    });
    await quick(page, 'Bez').click();
    await page
      .getByRole('dialog', { name: 'Bez' })
      .getByRole('button', { name: 'Kaydet', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Bez' })).toBeHidden();
    await quick(page, 'Biberon').click();
    await page
      .getByRole('dialog', { name: 'Biberon' })
      .getByRole('button', { name: 'Vazgeç', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Biberon' })).toBeHidden();
    expect(
      await page.evaluate(() => (window as unknown as { __emptySheets: string[] }).__emptySheets),
    ).toEqual([]);
  });
});
