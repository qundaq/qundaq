import { expect, type Page } from '@playwright/test';

export async function openTab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name, exact: true })
    .click();
}

export async function addBabyInSettings(page: Page, name: string) {
  await openTab(page, 'Ayarlar');
  await page.getByRole('button', { name: 'Bebek ekle', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bebek ekle' });
  await dialog.getByLabel('İsim').fill(name);
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
}

export function babyCard(page: Page, name: string) {
  return page.getByRole('article', { name });
}

export function quick(page: Page, name: string) {
  return page
    .getByRole('group', { name: 'Hızlı kayıt' })
    .getByRole('button', { name, exact: true });
}

/** The rows of the Günlük list. */
export function logRows(page: Page) {
  return page.getByRole('list', { name: 'Kayıtlar', exact: true }).getByRole('listitem');
}

/** Opens the edit sheet of the first Günlük row that contains `text`. */
export async function openRow(page: Page, text: string) {
  await logRows(page).filter({ hasText: text }).first().getByRole('button').click();
}

export function dayPicker(page: Page) {
  return page.getByRole('group', { name: 'Gün', exact: true });
}

export function filterGroup(page: Page, name: 'Bebek' | 'Tür') {
  return page.getByRole('group', { name, exact: true });
}

/** Logs a wet diaper from Home, for the default baby or for everyone, now or at a picked time. */
export async function logDiaper(page: Page, options: { at?: string; all?: boolean } = {}) {
  await quick(page, 'Bez').click();
  const sheet = page.getByRole('dialog', { name: 'Bez' });
  if (options.all) await sheet.getByRole('button', { name: 'Hepsi', exact: true }).click();
  if (options.at) await sheet.getByLabel('Zaman').fill(options.at);
  await sheet.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(sheet).toBeHidden();
}

/** Opens Ana → Diğer, picks the entry type and returns the open sheet (its title follows the chip). */
export async function openOther(page: Page, chip: 'İlaç' | 'Büyüme' | 'Ateş' | 'Sağım' | 'Not') {
  await quick(page, 'Diğer').click();
  const sheet = page.getByRole('dialog');
  await sheet
    .getByRole('group', { name: 'Kayıt türü', exact: true })
    .getByRole('button', { name: chip, exact: true })
    .click();
  return sheet;
}

/** The value next to `label` in Özet's day card. */
export function summaryValue(page: Page, label: string) {
  return page
    .getByTestId('summary-day')
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd');
}

/** Every row of the events store, read straight from IndexedDB (deleted rows included). */
export function readEvents(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('events', 'readonly').objectStore('events').getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result as Record<string, unknown>[]);
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
  );
}
