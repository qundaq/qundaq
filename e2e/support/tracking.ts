import { expect, type Page } from '@playwright/test';

export async function openTab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Ana gezinme' }).getByRole('button', { name, exact: true }).click();
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

/** Every row of the events store, read straight from IndexedDB (deleted rows included). */
export function readEvents(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('events', 'readonly').objectStore('events').getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result as Record<string, unknown>[]);
          };
          getAll.onerror = () => reject(getAll.error);
        };
      }),
  );
}
