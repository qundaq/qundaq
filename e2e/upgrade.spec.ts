import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { babyCard, logRows, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NOW = new Date('2026-09-25T10:00:00+03:00').getTime();
const MINUTE = 60_000;

/**
 * Reads the stored database from a second connection: its IndexedDB version and the sleep row. Opening
 * without a version never triggers an upgrade, so the app's own connection is left alone.
 */
function readStored(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      new Promise<{ version: number; sleep: Record<string, unknown> }>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('events', 'readonly').objectStore('events').get('sleep-1');
          get.onsuccess = () => {
            db.close();
            resolve({ version: db.version, sleep: get.result as Record<string, unknown> });
          };
          get.onerror = () => reject(get.error ?? new Error('indexedDB get failed'));
        };
      }),
  );
}

// Phones updating to this version hold a Dexie v2 database (IndexedDB version 20), perhaps with a timer
// running. This build must open it, mark the running row for the `open` index (v3), add the mixes table (v4), and carry on.
test('a v2 database with a running sleep opens in this version and the sleep can be stopped', async ({
  page,
}) => {
  await page.clock.install({ time: NOW });

  // Seed once, from a same-origin page that does not load the app: the database exactly as the v2 build
  // made it (see src/db/db.ts, versions 1 and 2), with one baby, a running sleep and a finished diaper.
  await page.goto('./favicon.ico');
  await page.evaluate(
    ({ now, minute }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('qundaq', 20);
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('settings', { keyPath: 'id' });
          db.createObjectStore('babies', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
          const events = db.createObjectStore('events', { keyPath: 'id' });
          events.createIndex('babyId', 'babyId');
          events.createIndex('type', 'type');
          events.createIndex('startAt', 'startAt');
          events.createIndex('[babyId+startAt]', ['babyId', 'startAt']);
          events.createIndex('updatedAt', 'updatedAt');
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['babies', 'events'], 'readwrite');
          const created = now - 30 * 24 * 60 * minute;
          tx.objectStore('babies').add({
            id: 'baby-1',
            name: 'Ada',
            color: '#7cb7ff',
            archived: false,
            createdAt: created,
            updatedAt: created,
          });
          const events = tx.objectStore('events');
          const sleepAt = now - 60 * minute;
          events.add({
            id: 'sleep-1',
            type: 'sleep',
            babyId: 'baby-1',
            startAt: sleepAt,
            createdAt: sleepAt,
            updatedAt: sleepAt,
          });
          const diaperAt = now - 90 * minute;
          events.add({
            id: 'diaper-1',
            type: 'diaper',
            babyId: 'baby-1',
            startAt: diaperAt,
            wet: true,
            dirty: false,
            createdAt: diaperAt,
            updatedAt: diaperAt,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
        };
      }),
    { now: NOW, minute: MINUTE },
  );

  await page.goto('./');
  await openTab(page, t('tab.home'));
  const card = babyCard(page, 'Ada');
  const asleepHeadline = t('strip.asleep', { time: '' }).split(' \u00b7')[0]!;
  await expect(card).toContainText(asleepHeadline);
  const oneHour = t('time.hoursMinutes', { h: 1, m: 0 }).split(' ').slice(0, 2).join(' ');
  await expect(card.getByTestId('live-text')).toContainText(oneHour);

  const upgraded = await readStored(page);
  expect(upgraded.version).toBe(40);
  expect(upgraded.sleep.open).toBe(1);

  await card.getByRole('button', { name: `Ada: ${t('timer.wakeUp')}`, exact: true }).click();
  await expect(card).toContainText(t('tile.awake'));
  expect((await readStored(page)).sleep.open).toBeUndefined();

  await openTab(page, t('tab.log'));
  const rows = logRows(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(t('sheet.sleep.title'));
  await expect(rows.nth(0)).toContainText('09:00 – 10:00');
  await expect(rows.nth(1)).toContainText('08:30');
  await expect(rows.nth(1)).toContainText(t('diaper.wet.button'));
});
