import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { fakeAudio, soundStatus, tile } from './support/audio';
import {
  downloadedText,
  failNextShare,
  openExport,
  pickBackupFile,
  stubShare,
  takeBackup,
} from './support/backup';
import {
  addBabyInSettings,
  babyCard,
  cardAction,
  feedTile,
  logRows,
  openOther,
  openRow,
  openTab,
} from './support/tracking';

// The browser may re-check the app's own sw.js for updates on navigation. That is the single request
// MANIFESTO.md documents as outside the app's control; it carries no user data. Anything else counts
// as leaked, including an sw.js on any other origin or path.
function isBrowserSwUpdateCheck(url: string): boolean {
  const parsed = new URL(url);
  return parsed.origin === 'http://localhost:4173' && parsed.pathname === '/sw.js';
}
const WEBKIT_SKIP =
  'Playwright WebKit: route()/setOffline() act before the service worker; iOS covered by docs/device-checklist.md';

async function installAndWaitForOfflineReady(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: t('tab.settings'), exact: true }).click();
  const offlineReady = t('settings.offline.ready').split('(')[0]!.trim();
  await expect(page.getByText(new RegExp(offlineReady))).toBeVisible({ timeout: 20_000 });
}

test('shows "offline ready" once the service worker has cached the app', async ({ page }) => {
  await installAndWaitForOfflineReady(page);
});

test('cold-starts with the network disabled', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);
  await context.setOffline(true);
  const fresh = await context.newPage();
  await fresh.goto('./');
  await expect(fresh.getByRole('navigation', { name: t('nav.label') })).toBeVisible();
});

test('makes no network requests after the first load', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await installAndWaitForOfflineReady(page);

  const leaked: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    // A download of a file the page made itself (a blob: URL) is not a network request. Chromium does not
    // route those today; should it start to, they must not count as leaked nor be blocked.
    if (url.startsWith('blob:')) return route.continue();
    if (!isBrowserSwUpdateCheck(url)) leaked.push(url);
    return route.abort();
  });

  await stubShare(page); // installed by the reload below
  await fakeAudio(page);
  await page.reload();
  const nav = page.getByRole('navigation', { name: t('nav.label') });
  for (const name of [
    t('tab.log'),
    t('tab.summary'),
    t('tab.sounds'),
    t('tab.home'),
    t('tab.settings'),
  ]) {
    await nav.getByRole('button', { name, exact: true }).click();
  }

  // The tracking flows must stay on the device too.
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const card = babyCard(page, 'Ada');

  await cardAction(page, 'diaper').click();
  const diaper = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await diaper.getByRole('radio', { name: t('diaper.both.button'), exact: true }).click();
  await diaper.getByRole('radio', { name: t('stool.color.yellow'), exact: true }).click();
  await diaper.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(card).toContainText(t('diaper.both'));

  await cardAction(page, 'breastfeed').click();
  await page
    .getByRole('dialog', { name: t('sheet.breastfeed.title') })
    .getByRole('button', { name: t('side.L.button'), exact: true })
    .click();
  const feedingHeadline = t('strip.feeding', { side: '' }).split(' ·')[0]!;
  await expect(card).toContainText(feedingHeadline);
  await card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) }).click();
  await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(0);

  await cardAction(page, 'bottle').click();
  const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
  await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
  await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(feedTile(page, 'Ada')).toContainText('90 ml');

  // History, editing, the "Other" sheet and the summary stay on the device as well.
  const other = await openOther(page, 'medication');
  await other.getByLabel(t('medication.name')).fill('Vitamin D');
  await other.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(other).toBeHidden();

  await openTab(page, t('tab.log'));
  await openRow(page, t('sheet.bottle.title'));
  const edit = page.getByRole('dialog', {
    name: `${t('edit.title')} · ${t('sheet.bottle.title')}`,
  });
  await edit.getByLabel(t('sheet.amount')).fill('120');
  await edit.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(logRows(page).filter({ hasText: '120 ml' })).toHaveCount(1);
  await expect(logRows(page).filter({ hasText: 'Vitamin D' })).toHaveCount(1);

  await openTab(page, t('tab.summary'));
  await expect(page.getByRole('heading', { name: t('summary.week') })).toBeVisible();

  // A sound plays offline (the audio stub answers its file in the page, never the network), and the
  // source list comes from the cache.
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.playing', { name: t('sound.white') })} · ${t('sounds.remaining', { m: 60 })}`,
  );

  await openTab(page, t('tab.settings'));
  await page.getByRole('button', { name: t('settings.sources'), exact: true }).click();
  const sources = page.getByRole('dialog', { name: t('settings.sources') });
  await expect(sources).toContainText('| file |');
  await sources.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  await expect(sources).toBeHidden();

  // Backup, CSV, the download fallback and restoring stay on the device too: a file goes only where the
  // user's share sheet sends it.
  const backup = await takeBackup(page);
  await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
  const csv = page.getByRole('dialog', { name: t('csv.title') });
  await csv.getByRole('button', { name: t('export.share'), exact: true }).click();
  await csv.getByRole('button', { name: t('common.ok'), exact: true }).click();
  const exportSheet = await openExport(page);
  await failNextShare(page, 'DataError');
  await exportSheet.getByRole('button', { name: t('export.share'), exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportSheet.getByRole('button', { name: t('export.download'), exact: true }).click(),
  ]);
  expect(JSON.parse(await downloadedText(download))).toMatchObject({ app: 'qundaq' });
  await exportSheet.getByRole('button', { name: t('common.yes'), exact: true }).click();
  await exportSheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  const restore = await pickBackupFile(page, backup);
  await restore.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 0, updated: 0, removed: 0, moved: 0 }),
  );
  await restore.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.settings'));
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

  expect(leaked).toEqual([]);
});
