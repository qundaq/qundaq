import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { clockTime, shortDate } from '../src/ui/history/describe';
import {
  babyIdOf,
  clearAppData,
  pickBackupFile,
  putRawEvent,
  sharedFiles,
  stubShare,
} from './support/backup';
import {
  addBabyInSettings,
  babyCard,
  logDiaper,
  logRows,
  openRow,
  openTab,
  showTimeView,
  groupedRows,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NOW = new Date('2026-09-26T10:00:00+03:00').getTime();
const MINUTE = 60_000;
const contentsPrefix = (babies: number, events: number) =>
  t('export.contents', { babies, events, size: 'X' }).split(' · ').slice(0, 2).join(' · ');

/**
 * No test hook in the app: a finished breastfeed with no sides, written straight into IndexedDB, makes
 * Home's babyStatus throw (`segments.at(-1)!.side`). The log (history) tolerates it (describeEvent reads
 * `segments ?? []`), which is where the user can delete it. Leaves the page on the crashed Home screen.
 */
async function crashHome(page: Page) {
  await page.clock.install({ time: NOW });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page, { at: '2026-09-26T09:00' });
  const babyId = await babyIdOf(page, 'Ada');
  const at = NOW - 30 * MINUTE;
  await putRawEvent(page, {
    id: 'bad-feed',
    type: 'breastfeed',
    babyId,
    startAt: at,
    endAt: at + 10 * MINUTE,
    segments: [],
    createdAt: at,
    updatedAt: at,
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: t('crash.title') })).toBeVisible();
}

/** The crash screen's backup button (export.title); returns the backup's JSON text. */
async function emergencyBackup(page: Page): Promise<string> {
  await page.getByRole('button', { name: t('export.title'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('export.title') });
  await expect(sheet).toContainText(contentsPrefix(1, 2));
  await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(t('export.shared'));
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await expect(sheet).toBeHidden();
  const [file] = await sharedFiles(page);
  return file!.text;
}

test('a crashing screen shows the fallback; its backup works, and the log can remove the bad entry', async ({
  page,
}) => {
  await crashHome(page);
  await expect(page.getByText(t('crash.otherTabs'))).toBeVisible();
  await expect(page.getByRole('button', { name: t('crash.reload'), exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByLabel(t('import.title'), { exact: true })).toBeVisible();

  const backup = JSON.parse(await emergencyBackup(page)) as {
    events: { id: string; type: string; segments?: unknown }[];
  };
  expect(backup.events.map((event) => event.type).sort()).toEqual(['breastfeed', 'diaper']);
  expect(backup.events.find((event) => event.id === 'bad-feed')).toMatchObject({ segments: [] });

  // The other tabs work, and the log shows the bad entry, so it can be deleted.
  await openTab(page, t('tab.log'));
  await showTimeView(page);
  await expect(logRows(page)).toHaveCount(2);
  await openRow(page, t('sheet.breastfeed.title'));
  const edit = page.getByRole('dialog', {
    name: `${t('edit.title')} · ${t('sheet.breastfeed.title')}`,
  });
  await edit.getByRole('button', { name: t('edit.delete'), exact: true }).click();
  await page.clock.fastForward(1000);
  await edit.getByRole('button', { name: t('edit.deleteConfirm'), exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(logRows(page)).toHaveCount(1);

  await openTab(page, t('tab.home'));
  await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
  await expect(page.getByText(t('crash.title'))).toHaveCount(0);
});

test("the crash screen's backup restores its good entries; the bad one is named and skipped", async ({
  page,
}) => {
  await crashHome(page);
  const backup = await emergencyBackup(page);

  await clearAppData(page);
  const sheet = await pickBackupFile(page, backup);
  await expect(sheet).toContainText(t('import.skipped', { n: 1 }));
  await sheet.getByText(t('import.skippedDetails'), { exact: true }).click();
  const badAt = NOW - 30 * MINUTE;
  await expect(sheet.getByRole('listitem')).toHaveText([
    `${shortDate('tr', badAt)} ${clockTime('tr', badAt)} · ${t('sheet.breastfeed.title')}: ${t('backup.problem.bad-payload')}`,
  ]);
  await sheet.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 1, updated: 0, removed: 0, moved: 0 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.home'));
  await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
  await openTab(page, t('tab.log'));
  await expect(groupedRows(page)).toHaveCount(1);
});

test('a restore from the crash screen that replaces the bad entry brings the screen back at once', async ({
  page,
}) => {
  await crashHome(page);
  const backup = await emergencyBackup(page);

  // Straight from the crash screen, without leaving the tab.
  await page
    .getByRole('main')
    .getByLabel(t('import.title'), { exact: true })
    .setInputFiles({
      name: 'qundaq-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
  const sheet = page.getByRole('dialog', { name: t('import.title') });
  await expect(sheet).toContainText(t('import.skipped', { n: 1 }));
  await sheet.getByRole('button', { name: t('import.mode.replace'), exact: true }).click();
  await sheet
    .getByRole('checkbox', {
      name: t('import.confirmReplace'),
    })
    .check();
  await sheet.getByRole('button', { name: t('import.applyReplace'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.replace', { babies: 1, events: 1 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText(t('crash.title'))).toHaveCount(0);
  await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
});
