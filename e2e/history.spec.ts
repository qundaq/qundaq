import { expect, test } from '@playwright/test';
import {
  addBabyInSettings,
  babyCard,
  dayPicker,
  filterGroup,
  logDiaper,
  logRows,
  openRow,
  openTab,
  quick,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T10:00:00+03:00') });
  await page.goto('./');
});

test.describe('Günlük list', () => {
  test('entries logged today appear newest first', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    // Explicit times: the clock keeps running while the test sets up, so "now" is not a fixed minute.
    await logDiaper(page, { at: '2026-09-25T09:40' });
    await quick(page, 'Biberon').click();
    const bottle = page.getByRole('dialog', { name: 'Biberon' });
    await bottle.getByLabel('Zaman').fill('2026-09-25T09:45');
    await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
    await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, 'Günlük');
    await expect(dayPicker(page)).toContainText('Bugün');
    await expect(dayPicker(page).getByRole('button', { name: 'Sonraki gün' })).toBeDisabled();
    const rows = logRows(page);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('09:45');
    await expect(rows.nth(0)).toContainText('Biberon');
    await expect(rows.nth(0)).toContainText('90 ml · Anne sütü');
    await expect(rows.nth(1)).toContainText('09:40');
    await expect(rows.nth(1)).toContainText('Islak');
    // One baby: no baby filter.
    await expect(filterGroup(page, 'Bebek')).toHaveCount(0);
  });

  test('previous and next day, the date field, and never the old day under the new heading', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await logDiaper(page, { at: '2026-09-24T21:00' });
    await logDiaper(page, { at: '2026-09-25T09:00' });
    await openTab(page, 'Günlük');
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('09:00');

    // Record every rendered state of the day heading and the rows while switching days.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __logStates: string[] }).__logStates = seen;
      new MutationObserver(() => {
        const day = document.querySelector('[data-testid="day-current"]')?.textContent ?? '';
        const rows = Array.from(
          document.querySelectorAll('[data-testid="log-list"] li'),
          (li) => li.textContent ?? '',
        );
        seen.push(`${day}|${rows.join('#')}`);
      }).observe(document.querySelector('main')!, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await dayPicker(page).getByRole('button', { name: 'Önceki gün' }).click();
    await expect(dayPicker(page)).toContainText('Dün');
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('21:00');
    const states = await page.evaluate(
      () => (window as unknown as { __logStates: string[] }).__logStates,
    );
    // The observer really saw the new day's row (not just an empty selector match).
    expect(states.some((state) => state.startsWith('Dün') && state.includes('21:00'))).toBe(true);
    expect(states.filter((state) => state.startsWith('Dün') && state.includes('09:00'))).toEqual(
      [],
    );

    await dayPicker(page).getByRole('button', { name: 'Sonraki gün' }).click();
    await expect(dayPicker(page)).toContainText('Bugün');

    await dayPicker(page).getByLabel('Gün seç').fill('2026-09-20');
    await expect(dayPicker(page)).toContainText('20 Eylül');
    await expect(page.getByText('Bu gün için kayıt yok.')).toBeVisible();
    await dayPicker(page).getByLabel('Gün seç').fill('2026-09-30');
    await expect(dayPicker(page)).toContainText('Bugün');
  });

  test('baby and type filters, kept across tab switches', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Can');
    await openTab(page, 'Ana');
    await logDiaper(page, { all: true });
    await quick(page, 'Biberon').click();
    const bottle = page.getByRole('dialog', { name: 'Biberon' });
    await bottle.getByRole('button', { name: 'Can', exact: true }).click(); // "Hepsi" was remembered; keep only Ada
    await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
    await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, 'Günlük');
    await expect(logRows(page)).toHaveCount(3);
    await filterGroup(page, 'Bebek').getByRole('button', { name: 'Ada', exact: true }).click();
    await expect(logRows(page)).toHaveCount(2);
    await filterGroup(page, 'Tür').getByRole('button', { name: 'Bez', exact: true }).click();
    await expect(logRows(page)).toHaveCount(1);
    await filterGroup(page, 'Tür').getByRole('button', { name: 'Uyku', exact: true }).click();
    await expect(page.getByText('Filtreye uyan kayıt yok.')).toBeVisible();

    await openTab(page, 'Ana');
    await openTab(page, 'Günlük');
    await expect(
      filterGroup(page, 'Bebek').getByRole('button', { name: 'Ada', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      filterGroup(page, 'Tür').getByRole('button', { name: 'Uyku', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await filterGroup(page, 'Bebek').getByRole('button', { name: 'Hepsi', exact: true }).click();
    await filterGroup(page, 'Tür').getByRole('button', { name: 'Tümü', exact: true }).click();
    await expect(logRows(page)).toHaveCount(3);
  });

  test('a sleep across midnight shows on both days with the other day marked', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    const sheet = page.getByRole('dialog', { name: 'Uyku' });
    await sheet.getByLabel('Zaman').fill('2026-09-25T06:30');
    await sheet.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('500');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();

    await openTab(page, 'Günlük');
    await expect(logRows(page).first()).toContainText('22:10 (önceki gün) – 06:30');
    await dayPicker(page).getByRole('button', { name: 'Önceki gün' }).click();
    await expect(logRows(page).first()).toContainText('22:10 – 06:30 (ertesi gün)');
  });
});

test.describe('editing and deleting', () => {
  test('a bottle: amount, time and a note', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await logDiaper(page);
    await quick(page, 'Biberon').click();
    const bottle = page.getByRole('dialog', { name: 'Biberon' });
    await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
    await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, 'Günlük');
    await openRow(page, 'Biberon');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Biberon' });
    await sheet.getByLabel('Miktar (ml)').fill('120');
    await sheet.getByLabel('Zaman').fill('2026-09-25T09:30');
    await sheet.getByLabel('Not (isteğe bağlı)').fill('Yarısını kustu');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();

    const rows = logRows(page);
    await expect(rows.nth(0)).toContainText('Islak');
    await expect(rows.nth(1)).toContainText('09:30');
    await expect(rows.nth(1)).toContainText('120 ml · Anne sütü');
    await expect(rows.nth(1)).toContainText('Yarısını kustu');
    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada')).toContainText('biberon 120 ml');
  });

  test('deleting takes two taps; a double tap does not delete', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Biberon').click();
    const bottle = page.getByRole('dialog', { name: 'Biberon' });
    await bottle.getByRole('button', { name: '90 ml', exact: true }).click();
    await bottle.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText('biberon 90 ml');

    await openTab(page, 'Günlük');
    await openRow(page, 'Biberon');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Biberon' });
    const remove = sheet.getByRole('button', { name: /^(Sil|Silmek için tekrar dokunun)$/ });
    await remove.dblclick();
    await expect(remove).toHaveText('Silmek için tekrar dokunun');
    await expect(sheet).toBeVisible();
    await page.clock.fastForward(5000);
    await expect(remove).toHaveText('Sil');

    await remove.click();
    await expect(remove).toHaveText('Silmek için tekrar dokunun');
    await page.clock.fastForward(1000);
    await remove.click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Bu gün için kayıt yok.')).toBeVisible();
    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada')).not.toContainText('biberon');
  });

  test('Cancel and Esc wait for a save in flight', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await logDiaper(page, { at: '2026-09-25T09:40' });
    await openTab(page, 'Günlük');
    await openRow(page, 'Bez');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Bez' });
    await sheet.getByLabel('Not (isteğe bağlı)').fill('Pişik kremi');

    // A second connection holds a read-write transaction on the events, so the app's save has to wait.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('qundaq');
          open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
          open.onsuccess = () => {
            const store = open.result.transaction('events', 'readwrite').objectStore('events');
            const hold = () => {
              if (!(window as unknown as { __release?: boolean }).__release)
                store.get('none').onsuccess = hold;
            };
            hold();
            resolve();
          };
        }),
    );
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Vazgeç', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __release?: boolean }).__release = true;
    });
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('Pişik kremi');
  });

  test("a finished feed's sides and minutes can be changed", async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    const feed = page.getByRole('dialog', { name: 'Emzirme' });
    await feed.getByLabel('Zaman').fill('2026-09-25T09:50');
    await feed.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('15');
    await feed.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(feed).toBeHidden();

    await openTab(page, 'Günlük');
    await expect(logRows(page).first()).toContainText('09:35 – 09:50');
    await expect(logRows(page).first()).toContainText('Sol 15 dk');
    await openRow(page, 'Emzirme');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Emzirme' });
    await sheet.getByRole('group', { name: '1. taraf' }).getByLabel('Dakika').fill('12');
    await sheet.getByRole('button', { name: 'Taraf ekle', exact: true }).click();
    await sheet.getByRole('group', { name: '2. taraf' }).getByLabel('Dakika').fill('3');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('09:35 – 09:50');
    await expect(logRows(page).first()).toContainText('Sol 12 dk · Sağ 3 dk');
  });

  test('an edit that breaks a rule says why and keeps the sheet open', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    const sleep = page.getByRole('dialog', { name: 'Uyku' });
    await sleep.getByLabel('Zaman').fill('2026-09-25T09:00');
    await sleep.getByLabel('Süre (dk) — boş bırakırsanız sayaç başlar').fill('60');
    await sleep.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sleep).toBeHidden();

    await openTab(page, 'Günlük');
    await openRow(page, 'Uyku');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Uyku' });
    await sheet.getByLabel('Bitiş', { exact: true }).fill('2026-09-25T07:30');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText('Bitiş, başlangıçtan önce olamaz.');
    await expect(sheet).toBeVisible();
    await expect(logRows(page).first()).toContainText('08:00 – 09:00');
  });

  test('a running feed: correct the current side and end it at a chosen time', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Emzir').click();
    const feed = page.getByRole('dialog', { name: 'Emzirme' });
    await feed.getByLabel('Zaman').fill('2026-09-25T09:50');
    await feed.getByRole('button', { name: 'Başlat', exact: true }).click();
    await expect(feed).toBeHidden();

    await openTab(page, 'Günlük');
    await expect(logRows(page).first()).toContainText('09:50 – devam ediyor');
    await expect(logRows(page).first()).toContainText('Sol · devam ediyor');
    await openRow(page, 'Emzirme');
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Emzirme' });
    await sheet
      .getByRole('group', { name: '1. taraf' })
      .getByRole('button', { name: 'Sağ', exact: true })
      .click();
    await sheet.getByLabel('Bitiş (isteğe bağlı)').fill('2026-09-25T09:58');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('09:50 – 09:58');
    await expect(logRows(page).first()).toContainText('Sağ 8 dk');
    await openTab(page, 'Ana');
    await expect(
      babyCard(page, 'Ada').getByRole('button', { name: /Emzirmeyi bitir/ }),
    ).toHaveCount(0);
  });

  test('a running sleep: changes must be saved before "Uyandı", which then stops it', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    await page
      .getByRole('dialog', { name: 'Uyku' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();

    await openTab(page, 'Günlük');
    await expect(logRows(page).first()).toContainText(/10:0\d – devam ediyor/);
    await openRow(page, 'Uyku');
    let sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Uyku' });
    const wakeUp = () => sheet.getByRole('button', { name: 'Uyandı', exact: true });
    await expect(sheet.getByLabel('Bitiş', { exact: true })).toHaveCount(0);
    await expect(wakeUp()).toBeEnabled();
    const start = sheet.getByLabel('Başlangıç', { exact: true });
    const stored = await start.inputValue();
    // Changed and changed back: the stored time (seconds included) is restored, so nothing is left to save.
    await start.fill('2026-09-25T09:30');
    await expect(wakeUp()).toBeDisabled();
    await start.fill(stored);
    await expect(wakeUp()).toBeEnabled();
    await start.fill('2026-09-25T09:30');
    await expect(wakeUp()).toBeDisabled();
    await expect(sheet.getByText('Değişiklikleri önce kaydedin.')).toBeVisible();
    await expect(wakeUp()).toHaveAccessibleDescription('Değişiklikleri önce kaydedin.');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('09:30 – devam ediyor');

    await openRow(page, 'Uyku');
    sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Uyku' });
    await wakeUp().click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).not.toContainText('devam ediyor');
    await openTab(page, 'Ana');
    await expect(babyCard(page, 'Ada')).toContainText('Uyanık');
  });

  test('"Durdurmayı unuttunuz mu?" opens the running entry so it can end at the right time', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, 'Ana');
    await quick(page, 'Uyku').click();
    await page
      .getByRole('dialog', { name: 'Uyku' })
      .getByRole('button', { name: 'Başlat', exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    const hint = card.getByRole('button', { name: 'Ada: Durdurmayı unuttunuz mu?', exact: true });
    await expect(card).toContainText('Uyuyor');
    await expect(hint).toHaveCount(0);

    await page.clock.fastForward('13:00:00');
    await expect(hint).toHaveText('Durdurmayı unuttunuz mu?');
    await hint.click();
    const sheet = page.getByRole('dialog', { name: 'Kaydı düzenle · Uyku' });
    await sheet.getByLabel('Bitiş (isteğe bağlı)').fill('2026-09-25T12:30');
    await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(card).toContainText('Uyanık · 10 sa 30 dk');
    await expect(hint).toHaveCount(0);
  });
});
