import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';

export interface SharedFile {
  name: string;
  type: string;
  bom: boolean; // starts with the UTF-8 byte order mark
  text: string; // decoded as UTF-8, without the BOM
}

interface ShareStub {
  __shared: SharedFile[];
  __shareCalls: number;
  __shareError?: string;
}

/**
 * Replaces the Web Share API with a stub that keeps every shared file. Playwright WebKit has a real
 * navigator.share (so may Chromium, depending on the host), so every backup test either stubs it or
 * removes it. Both members are defined on Navigator.prototype, as the browser does.
 */
export async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const stub = window as unknown as ShareStub;
    stub.__shared = [];
    stub.__shareCalls = 0;
    Object.defineProperty(Navigator.prototype, 'canShare', {
      configurable: true,
      writable: true,
      value: (data?: ShareData) => Array.isArray(data?.files) && data.files.length > 0,
    });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      writable: true,
      value: async (data?: ShareData) => {
        stub.__shareCalls += 1;
        const error = stub.__shareError;
        if (error) {
          stub.__shareError = undefined;
          throw new DOMException('Stubbed share failure', error);
        }
        for (const file of data?.files ?? []) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
          stub.__shared.push({
            name: file.name,
            type: file.type,
            bom,
            text: new TextDecoder().decode(bytes),
          });
        }
      },
    });
  });
}

/** The next share fails with a DOMException of this name (AbortError, NotAllowedError, …). */
export async function failNextShare(page: Page, name: string) {
  await page.evaluate((errorName) => {
    (window as unknown as ShareStub).__shareError = errorName;
  }, name);
}

/** No Web Share API at all, as in a browser without file sharing: the sheet offers a download. */
export async function removeShare(page: Page) {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
}

export function sharedFiles(page: Page): Promise<SharedFile[]> {
  return page.evaluate(() => (window as unknown as ShareStub).__shared);
}

/** How often the page called navigator.share, successful or not. */
export function shareCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as ShareStub).__shareCalls);
}

export async function downloadedText(download: Download): Promise<string> {
  return readFile(await download.path(), 'utf8');
}

/** Ayarlar → Yedek al; returns the open export sheet. */
export async function openExport(page: Page) {
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name: 'Ayarlar', exact: true })
    .click();
  await page.getByRole('button', { name: 'Yedek al', exact: true }).click();
  return page.getByRole('dialog', { name: 'Yedek al' });
}

/** Writes a row straight into IndexedDB, past the app and its checks, as a bug or a bad import could. */
export function putRawEvent(page: Page, row: Record<string, unknown>): Promise<void> {
  return page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('events', 'readwrite');
          tx.objectStore('events').put(value);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
        };
      }),
    row,
  );
}

/** The id of the baby called `name`, read straight from IndexedDB. */
export function babyIdOf(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (wanted) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('babies', 'readonly').objectStore('babies').getAll();
          getAll.onsuccess = () => {
            db.close();
            const baby = (getAll.result as { id: string; name: string }[]).find(
              (row) => row.name === wanted,
            );
            if (baby) resolve(baby.id);
            else reject(new Error(`No baby called ${wanted}`));
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
    name,
  );
}

/** Ayarlar → Yedek al → share (the stub must be installed); returns the JSON text of the backup. */
export async function takeBackup(page: Page): Promise<string> {
  const before = (await sharedFiles(page)).length;
  const sheet = await openExport(page);
  await sheet.getByRole('button', { name: "Dosyalar'a kaydet / paylaş", exact: true }).click();
  await sheet.getByRole('button', { name: 'Tamam', exact: true }).click();
  const files = await sharedFiles(page);
  if (files.length !== before + 1)
    throw new Error(`expected one new shared file, got ${files.length - before}`);
  return files.at(-1)!.text;
}

/**
 * "Clear data": deletes the database and opens the app again, empty. The navigation to favicon.ico does
 * not leave the app: once the service worker controls the page it answers every navigation with
 * index.html, so the app loads there too. The delete still goes through because Dexie closes its connection on the delete's versionchange
 * event (a still-open connection would block it, and onblocked fails the test).
 */
export async function clearAppData(page: Page) {
  await page.goto('./favicon.ico');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('qundaq');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onblocked = () => reject(new Error('The database is still open somewhere'));
      }),
  );
  await page.goto('./');
}

/** Ayarlar → Yedekten geri yükle with a file holding `text`; returns the import sheet. */
export async function pickBackupFile(page: Page, text: string, name = 'qundaq-backup.json') {
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('button', { name: 'Ayarlar', exact: true })
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
  return page.getByRole('dialog', { name: 'Yedekten geri yükle' });
}
