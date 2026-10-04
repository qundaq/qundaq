import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { clearAppData, pickBackupFile, sharedFiles, stubShare, takeBackup } from './support/backup';
import {
  addBabyInSettings,
  babyCard,
  logDiaper,
  logRows,
  openTab,
  cardAction,
} from './support/tracking';
import { clockTime, shortDate } from '../src/ui/history/describe';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  await stubShare(page);
  await page.goto('./');
});

const counts = (vars: {
  add: number;
  update: number;
  remove: number;
  same: number;
  keep: number;
}) => t('import.counts', vars);

test('a backup restores into an emptied app', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
  await logDiaper(page, { baby: 'Ada', at: '2026-09-26T09:00' });
  await logDiaper(page, { baby: 'Cal', at: '2026-09-26T09:00' });
  const backup = await takeBackup(page);

  await clearAppData(page);
  await openTab(page, t('tab.home'));
  await expect(page.getByText(t('home.empty'))).toBeVisible();

  // An empty Home offers the restore right away, before any baby is added again.
  await page
    .getByRole('main')
    .getByLabel(t('import.title'), { exact: true })
    .setInputFiles({
      name: 'qundaq-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
  const sheet = page.getByRole('dialog', { name: t('import.title') });
  await expect(sheet).toContainText(t('import.fileBabies', { names: 'Ada, Cal' }));
  await expect(sheet).toContainText(
    t('import.fileEvents', { n: 2, from: '', to: '' }).split(' ·')[0]!,
  );
  // Nothing on this phone: merging is all there is, so the mode choice is not offered.
  await expect(sheet.getByRole('button', { name: t('import.mode.replace') })).toHaveCount(0);
  await sheet.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 2, updated: 0, removed: 0, moved: 0 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.home'));
  await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
  await expect(babyCard(page, 'Cal')).toContainText(t('diaper.wet'));
  await openTab(page, t('tab.log'));
  await expect(logRows(page)).toHaveCount(2);
});

test('merging into a phone with other data: the preview counts match, and the same baby is recognised', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page, { at: '2026-09-26T08:00' });
  await logDiaper(page, { at: '2026-09-26T09:00' });
  const backup = await takeBackup(page);

  // The phone was wiped; Ada was added again (a new id) with one entry, and Ben is new.
  await clearAppData(page);
  await addBabyInSettings(page, 'ada');
  await addBabyInSettings(page, 'Ben');
  await openTab(page, t('tab.home'));
  // From "ada"'s own card, so only "ada" gets this extra entry, not Ben.
  await logDiaper(page, { baby: 'ada', at: '2026-09-26T09:30' });

  const sheet = await pickBackupFile(page, backup);
  await expect(
    sheet.getByRole('button', { name: t('import.mode.merge'), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    sheet.getByRole('checkbox', {
      name: t('import.sameBaby', { fileName: 'Ada', localName: 'ada' }),
    }),
  ).toBeChecked();
  // The backup's Ada survives in place of this phone's: the same baby, not an added one.
  await expect(sheet).toContainText(
    `${t('import.babies')}${counts({ add: 0, update: 0, remove: 0, same: 1, keep: 0 })}`,
  );
  await expect(sheet).toContainText(
    `${t('import.events')}${counts({ add: 2, update: 0, remove: 0, same: 0, keep: 0 })}`,
  );
  await expect(sheet).toContainText(t('import.moved', { n: 1, name: 'Ada' }));
  await sheet.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 2, updated: 0, removed: 0, moved: 1 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.home'));
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(babyCard(page, 'Ada')).toBeVisible();
  await expect(babyCard(page, 'Ben')).toBeVisible();
  await openTab(page, t('tab.log'));
  await expect(logRows(page).filter({ hasText: 'Ada' })).toHaveCount(3);
});

test('entries logged on a baby that the other phone combined follow it to the baby kept there', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page, { at: '2026-09-26T09:00' });
  // The other phone paired this Ada with its own, older Ada and deleted this one; its backup says so.
  const file = JSON.parse(await takeBackup(page)) as {
    exportedAt: number;
    babies: { id: string; createdAt: number; updatedAt: number; deletedAt?: number }[];
    events: unknown[];
  };
  const mine = file.babies[0]!;
  const older = {
    ...mine,
    id: 'older-ada',
    createdAt: mine.createdAt - 86_400_000,
    updatedAt: mine.createdAt - 86_400_000,
  };
  file.babies = [{ ...mine, deletedAt: file.exportedAt, updatedAt: file.exportedAt }, older];
  file.events = [];

  const sheet = await pickBackupFile(page, JSON.stringify(file));
  const follow = sheet.getByRole('checkbox', {
    name: t('import.follow', { localName: 'Ada', name: 'Ada' }),
  });
  await expect(follow).toBeChecked();
  await expect(sheet).toContainText(t('import.removedBabies', { names: 'Ada' }));
  await expect(sheet).toContainText(t('import.moved', { n: 1, name: 'Ada' }));
  // Kept apart, the entry would hide with the deleted baby: the preview says so.
  await follow.uncheck();
  await expect(sheet).toContainText(t('import.hidden', { name: 'Ada', n: 1 }));
  const movedWord = t('import.moved', { n: 1, name: 'Ada' }).replace(/\.$/, '').split(' ').at(-1)!;
  await expect(sheet).not.toContainText(movedWord);
  await follow.check();
  await sheet.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 0, updated: 0, removed: 0, moved: 1 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.home'));
  await expect(page.getByRole('article')).toHaveCount(1);
  await openTab(page, t('tab.log'));
  await expect(logRows(page).filter({ hasText: 'Ada' })).toHaveCount(1);
});

test('replace shows what it would lose, can back up first without losing the choice, and needs the checkbox', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page, { at: '2026-09-26T08:00' });
  const backup = await takeBackup(page);
  await openTab(page, t('tab.home'));
  await logDiaper(page, { at: '2026-09-26T09:40' }); // made after the backup

  const sheet = await pickBackupFile(page, backup);
  await sheet.getByRole('button', { name: t('import.mode.replace'), exact: true }).click();
  await expect(sheet).toContainText(t('import.replaceSummary', { babies: 1, events: 2 }));
  await expect(sheet).toContainText(
    t('import.loss', {
      n: 1,
      newest: `${shortDate('tr', new Date('2026-09-26T09:40:00+03:00').getTime())} ${clockTime('tr', new Date('2026-09-26T09:40:00+03:00').getTime())}`,
    }),
  );
  const replace = sheet.getByRole('button', { name: t('import.applyReplace'), exact: true });
  await expect(replace).toBeDisabled();

  // Back up first: the export sheet takes over, and the preview comes back with replace mode still chosen.
  await sheet.getByRole('button', { name: t('import.backupFirst'), exact: true }).click();
  const exportSheet = page.getByRole('dialog', { name: t('export.title') });
  await exportSheet.getByRole('button', { name: t('export.share'), exact: true }).click();
  await exportSheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await expect(sheet).toBeVisible();
  expect(await sharedFiles(page)).toHaveLength(2);
  await expect(
    sheet.getByRole('button', { name: t('import.mode.replace'), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await sheet
    .getByRole('checkbox', {
      name: t('import.confirmReplace'),
    })
    .check();
  await replace.click();
  await expect(sheet.getByRole('status')).toHaveText(
    t('import.done.replace', { babies: 1, events: 1 }),
  );
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await openTab(page, t('tab.log'));
  await expect(logRows(page)).toHaveCount(1);
  await expect(logRows(page)).toContainText(['08:00']);
});

test('broken files are refused with the right message, and nothing is written', async ({
  page,
}) => {
  const valid = {
    app: 'qundaq',
    schemaVersion: 1,
    exportedAt: Date.now(),
    appVersion: '0.1.0',
    babies: [],
    events: [],
    settings: {},
  };
  const cases: [string, string][] = [
    ['not JSON', t('import.error.not-backup')],
    [JSON.stringify({ ...valid, app: 'another-app' }), t('import.error.not-backup')],
    [JSON.stringify({ ...valid, schemaVersion: 99 }), t('import.error.newer-version')],
  ];
  for (const [text, message] of cases) {
    const sheet = await pickBackupFile(page, text);
    await expect(sheet.getByRole('alert')).toHaveText(message);
    await sheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  // One good baby, one good entry and one bad entry: the bad one is named and skipped.
  const T = new Date('2026-09-26T08:00:00+03:00').getTime();
  const baby = {
    id: 'b1',
    name: 'Ada',
    color: '#7cb7ff',
    archived: false,
    createdAt: T,
    updatedAt: T,
  };
  const good = {
    id: 'e1',
    type: 'diaper',
    babyId: 'b1',
    startAt: T,
    wet: true,
    dirty: false,
    createdAt: T,
    updatedAt: T,
  };
  const bad = {
    id: 'e2',
    type: 'bottle',
    babyId: 'b1',
    startAt: T + 60_000,
    ml: 5000,
    contents: 'formula',
    createdAt: T,
    updatedAt: T,
  };
  const sheet = await pickBackupFile(
    page,
    JSON.stringify({ ...valid, babies: [baby], events: [good, bad] }),
  );
  await expect(sheet).toContainText(t('import.skipped', { n: 1 }));
  await sheet.getByText(t('import.skippedDetails'), { exact: true }).click();
  const badAt = T + 60_000;
  await expect(sheet.getByRole('listitem')).toHaveText([
    `${shortDate('tr', badAt)} ${clockTime('tr', badAt)} · ${t('sheet.bottle.title')}: ${t('backup.problem.bad-payload')}`,
  ]);
  await sheet.getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.home'));
  await expect(page.getByText(t('home.empty'))).toBeVisible();
});

test('a running timer in an old backup is stopped at the time of the backup', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await cardAction(page, 'sleep').click();
  await page
    .getByRole('dialog', { name: t('sheet.sleep.title') })
    .getByRole('button', { name: t('sheet.startSleep'), exact: true })
    .click();
  const asleepHeadline = t('strip.asleep', { time: '' }).split(' ·')[0]!;
  await expect(babyCard(page, 'Ada')).toContainText(asleepHeadline);
  const backup = await takeBackup(page);

  // Two days later, on an emptied phone.
  await clearAppData(page);
  await page.clock.setSystemTime(new Date('2026-09-28T10:00:00+03:00'));
  const sheet = await pickBackupFile(page, backup);
  const since = new Date('2026-09-26T10:00:00+03:00').getTime();
  await expect(sheet).toContainText(
    t('import.staleItem', {
      name: 'Ada',
      type: t('sheet.sleep.title'),
      since: `${shortDate('tr', since)} ${clockTime('tr', since)}`,
    }),
  );
  await expect(sheet.getByRole('checkbox', { name: t('import.stopStale') })).toBeChecked();
  await sheet.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();

  await openTab(page, t('tab.home'));
  await expect(babyCard(page, 'Ada')).toContainText(t('tile.awake'));
  await expect(
    babyCard(page, 'Ada').getByRole('button', { name: `Ada: ${t('timer.wakeUp')}` }),
  ).toHaveCount(0);
});
