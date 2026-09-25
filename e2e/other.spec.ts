import { expect, test } from '@playwright/test';
import { addBabyInSettings, filterGroup, logRows, openOther, openTab, quick } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T10:00:00+03:00') });
  await page.goto('./');
});

test('a medicine for "Hepsi" makes one row per baby, and is offered again with its dose', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Can');
  await openTab(page, 'Ana');
  await quick(page, 'Diğer').click();
  const sheet = page.getByRole('dialog', { name: 'İlaç' }); // "İlaç" is the default chip
  await sheet.getByRole('button', { name: 'Hepsi', exact: true }).click();
  await sheet.getByLabel('İlaç / vitamin').fill('D vitamini');
  await sheet.getByLabel('Doz (isteğe bağlı)').fill('400 IU');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(2);
  await expect(logRows(page).filter({ hasText: 'D vitamini · 400 IU' })).toHaveCount(2);

  await openTab(page, 'Ana');
  await quick(page, 'Diğer').click();
  const again = page.getByRole('dialog', { name: 'İlaç' });
  await again.getByRole('group', { name: 'Son kullanılanlar' }).getByRole('button', { name: 'D vitamini', exact: true }).click();
  await expect(again.getByLabel('İlaç / vitamin')).toHaveValue('D vitamini');
  await expect(again.getByLabel('Doz (isteğe bağlı)')).toHaveValue('400 IU');
});

test('growth for one baby, typed with a comma', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Can');
  await openTab(page, 'Ana');
  const sheet = await openOther(page, 'Büyüme');
  await expect(page.getByRole('dialog', { name: 'Büyüme' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Hepsi', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Can', exact: true }).click();
  await sheet.getByLabel('Kilo (kg)').fill('3,45');
  await sheet.getByLabel('Boy (cm)').fill('52,5');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  const row = logRows(page).filter({ hasText: 'Büyüme' });
  await expect(row).toContainText('Can');
  await expect(row).toContainText('3,45 kg · Boy 52,5 cm');
  await filterGroup(page, 'Bebek').getByRole('button', { name: 'Ada', exact: true }).click();
  await expect(page.getByText('Filtreye uyan kayıt yok.')).toBeVisible();
});

test('a weight typed in grams asks for kilograms', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  const sheet = await openOther(page, 'Büyüme');
  await sheet.getByLabel('Kilo (kg)').fill('3450');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Kiloyu kg olarak girin (ör. 3,45).');
});

test('a temperature of 38 °C or more shows the fever hint and marks the row', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  const sheet = await openOther(page, 'Ateş');
  await sheet.getByLabel('Ateş (°C)').fill('38,2');
  await expect(sheet.getByText('38 °C ve üzeri ateş, özellikle 3 aydan küçük bebeklerde hemen doktora danışmayı gerektirir.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  const row = logRows(page).filter({ hasText: '38,2 °C' });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button')).toHaveAccessibleName(/Uyarı/);
});

test('pumping has no baby and shows under "Hepsi" only', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Can');
  await openTab(page, 'Ana');
  const sheet = await openOther(page, 'Sağım');
  await expect(sheet.getByRole('group', { name: 'Bebek', exact: true })).toHaveCount(0);
  await sheet.getByLabel('Sol (ml)').fill('60');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  const row = logRows(page).filter({ hasText: 'Sağım' });
  await expect(row).toContainText('Anne');
  await expect(row).toContainText('Sol 60 ml');
  await filterGroup(page, 'Bebek').getByRole('button', { name: 'Ada', exact: true }).click();
  await expect(page.getByText('Filtreye uyan kayıt yok.')).toBeVisible();
});

test('switching the type keeps the time and the note; a health note needs text', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  const sheet = await openOther(page, 'Not');
  await expect(page.getByRole('dialog', { name: 'Sağlık notu' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Bir not yazın.');
  await expect(sheet.getByLabel('Not', { exact: true })).toHaveAttribute('aria-required', 'true');

  await sheet.getByLabel('Zaman').fill('2026-09-25T09:15');
  await sheet.getByLabel('Not', { exact: true }).fill('Aşı günü, huysuz');
  await sheet.getByRole('group', { name: 'Kayıt türü', exact: true }).getByRole('button', { name: 'İlaç', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'İlaç' })).toBeVisible();
  await expect(sheet.getByLabel('Not (isteğe bağlı)')).toHaveValue('Aşı günü, huysuz');
  await expect(sheet.getByLabel('Zaman')).toHaveValue('2026-09-25T09:15');
  await sheet.getByRole('group', { name: 'Kayıt türü', exact: true }).getByRole('button', { name: 'Not', exact: true }).click();
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  const row = logRows(page).filter({ hasText: 'Sağlık notu' });
  await expect(row).toContainText('09:15');
  await expect(row).toContainText('Aşı günü, huysuz');
});

test('the five quick buttons fit at 320, 360 and 414 px, in Turkish and English', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  const check = async (groupName: string) => {
    const buttons = page.getByRole('group', { name: groupName, exact: true }).getByRole('button');
    for (const width of [320, 360, 414]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(buttons).toHaveCount(5);
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        expect(box!.width, `${groupName} at ${width}px`).toBeGreaterThanOrEqual(48);
        expect(box!.height, `${groupName} at ${width}px`).toBeGreaterThanOrEqual(48);
        expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth), `text clipped at ${width}px`).toBe(true);
        if (width >= 360) {
          // overflow-wrap would hide a mid-word break from the check above: each label must be one line.
          const lines = await button.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return range.getClientRects().length;
          });
          expect(lines, `label wraps at ${width}px`).toBe(1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `page overflow at ${width}px`).toBe(
        true,
      );
    }
  };
  await openTab(page, 'Ana');
  await check('Hızlı kayıt');
  await openTab(page, 'Ayarlar');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Home', exact: true }).click();
  await check('Quick log');
});
