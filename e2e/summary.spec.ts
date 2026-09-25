import { expect, test, type Page } from '@playwright/test';
import { addBabyInSettings, dayPicker, logRows, openOther, openRow, openTab, quick, summaryValue } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T09:00:00+03:00') });
  await page.goto('./');
});

function growthMetric(page: Page, name: string) {
  return page.getByRole('group', { name: 'Ölçüm', exact: true }).getByRole('button', { name, exact: true });
}

test('a sleep across midnight counts on both days; the week table has seven rows and fits 320px', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  await quick(page, 'Uyku').click();
  const sheet = page.getByRole('dialog', { name: 'Uyku' });
  await sheet.getByLabel('Zaman').fill('2026-09-25T02:00');
  await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('180');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Özet');
  await expect(page.getByRole('heading', { name: 'Ada · Bugün' })).toBeVisible();
  await expect(summaryValue(page, 'Uyku')).toHaveText('2 sa 0 dk'); // the sleep began yesterday: no count today
  const week = page.getByRole('table', { name: 'Son 7 gün' });
  await expect(week.locator('tbody tr')).toHaveCount(7);
  await expect(week.locator('tbody tr').nth(0)).toContainText('2 sa 0 dk');
  await expect(week.locator('tbody tr').nth(1)).toContainText('1 sa 0 dk');

  await dayPicker(page).getByRole('button', { name: 'Önceki gün' }).click();
  await expect(page.getByRole('heading', { name: 'Ada · Dün' })).toBeVisible();
  await expect(summaryValue(page, 'Uyku')).toHaveText('1 sa 0 dk · 1 kez');

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('growth shows in the chart summary and the measurement table; the metric survives tab switches', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');
  let sheet = await openOther(page, 'Büyüme');
  await sheet.getByLabel('Zaman').fill('2026-09-20T10:00');
  await sheet.getByLabel('Kilo (kg)').fill('3,45');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();
  sheet = await openOther(page, 'Büyüme');
  await sheet.getByLabel('Kilo (kg)').fill('4,1');
  await sheet.getByLabel('Baş çevresi (cm)').fill('36');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Özet');
  await expect(page.getByRole('img', { name: 'Kilo: 3,45 kg → 4,1 kg, 2 ölçüm' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Ölçümler' });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first()).toContainText('4,1 kg');

  await growthMetric(page, 'Baş çevresi').click();
  await expect(page.getByRole('img', { name: 'Baş çevresi: 36 cm, 1 ölçüm' })).toBeVisible();
  await growthMetric(page, 'Boy').click();
  await expect(page.getByText('Henüz ölçüm yok. Diğer → Büyüme ile ekleyin.')).toBeVisible();
  await openTab(page, 'Ana');
  await openTab(page, 'Özet');
  await expect(growthMetric(page, 'Boy')).toHaveAttribute('aria-pressed', 'true');
});

test('every record type shows up in Günlük and in Özet, without CSP violations', async ({ page }) => {
  test.slow(); // nine sheets in sequence: 12–26 s, close to the default 30 s timeout.
  // The rows (React style dots), the edit sheet and the SVG chart must all stay inside the CSP.
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) => store.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.reload();
  await addBabyInSettings(page, 'Ada');
  await openTab(page, 'Ana');

  await quick(page, 'Emzir').click();
  let sheet = page.getByRole('dialog', { name: 'Emzirme' });
  await sheet.getByRole('button', { name: 'Sağ', exact: true }).click();
  await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('15');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await quick(page, 'Biberon').click();
  sheet = page.getByRole('dialog', { name: 'Biberon' });
  await sheet.getByRole('button', { name: '90 ml', exact: true }).click();
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await quick(page, 'Uyku').click();
  sheet = page.getByRole('dialog', { name: 'Uyku' });
  await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('60');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await quick(page, 'Bez').click();
  sheet = page.getByRole('dialog', { name: 'Bez' });
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'İlaç');
  await sheet.getByLabel('İlaç / vitamin').fill('D vitamini');
  await sheet.getByLabel('Doz (isteğe bağlı)').fill('400 IU');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'Büyüme');
  await sheet.getByLabel('Kilo (kg)').fill('3,45');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'Ateş');
  await sheet.getByLabel('Ateş (°C)').fill('37,2');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'Sağım');
  await sheet.getByLabel('Sol (ml)').fill('60');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'Not');
  await sheet.getByLabel('Not', { exact: true }).fill('Aşı yapıldı');
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, 'Günlük');
  await expect(logRows(page)).toHaveCount(9);
  for (const text of ['Sağ 15 dk', '90 ml · Anne sütü', '1 sa 0 dk', 'Islak', 'D vitamini · 400 IU', '3,45 kg', '37,2 °C', 'Sol 60 ml', 'Aşı yapıldı']) {
    await expect(logRows(page).filter({ hasText: text }), text).toHaveCount(1);
  }
  await openRow(page, 'Biberon');
  const edit = page.getByRole('dialog', { name: 'Kaydı düzenle · Biberon' });
  await edit.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(edit).toBeHidden();

  await openTab(page, 'Özet');
  await expect(summaryValue(page, 'Beslenme')).toHaveText('2');
  await expect(summaryValue(page, 'Emzirme')).toHaveText('15 dk (sağ 15 dk)');
  await expect(summaryValue(page, 'Biberon')).toHaveText('1 kez · 90 ml');
  await expect(summaryValue(page, 'Uyku')).toHaveText('1 sa 0 dk · 1 kez');
  await expect(summaryValue(page, 'Bez')).toHaveText('1 ıslak · 0 kirli · 1 bez');
  await expect(page.locator('.summary-pump')).toContainText('Toplam 60 ml');
  await expect(page.getByRole('img', { name: 'Kilo: 3,45 kg, 1 ölçüm' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

test('without babies Özet only asks for one', async ({ page }) => {
  await openTab(page, 'Özet');
  await expect(page.getByText('Önce bir bebek ekleyin.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
