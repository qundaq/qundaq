import { expect, test } from '@playwright/test';
import { escapeRegExp, t } from './support/i18n';
import {
  downloadedText,
  failNextShare,
  lastBackupPrefix,
  openExport,
  removeShare,
  shareCalls,
  sharedFiles,
  stubShare,
} from './support/backup';
import {
  addBabyInSettings,
  logDiaper,
  openPump,
  pumpMlField,
  openTab,
  cardAction,
  pickTime,
} from './support/tracking';

test.describe('JSON backup', () => {
  test('shares one JSON file with every baby and entry; Settings then shows the backup', async ({
    page,
  }) => {
    await stubShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page);
    await openTab(page, t('tab.settings'));
    await expect(page.getByText(t('backup.never'))).toBeVisible();

    const sheet = await openExport(page);
    await expect(sheet).toContainText(
      t('export.contents', { babies: 1, events: 1, size: 'X' }).split(' · X')[0]!,
    );
    await expect(sheet).toContainText(t('export.warning'));
    await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText(t('export.shared'));

    const [file] = await sharedFiles(page);
    expect(file?.name).toMatch(/^qundaq-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(file?.type).toBe('application/json');
    const backup = JSON.parse(file!.text) as Record<string, unknown> & {
      babies: { name: string }[];
      events: object[];
    };
    expect(backup).toMatchObject({
      app: 'qundaq',
      schemaVersion: 1,
      settings: { locale: 'tr', nightMode: false },
    });
    expect(backup.babies.map((baby) => baby.name)).toEqual(['Ada']);
    expect(backup.events).toHaveLength(1);
    expect(file!.text).not.toContain('"open"');
    expect(file!.text).not.toContain('lastBackupAt');

    await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(new RegExp(`^${escapeRegExp(lastBackupPrefix())}`))).toBeVisible();
  });

  test('a cancelled share changes nothing; a refused one asks for another tap', async ({
    page,
  }) => {
    await stubShare(page);
    await page.goto('./');
    let sheet = await openExport(page);
    const share = () => sheet.getByRole('button', { name: t('export.share'), exact: true });

    await failNextShare(page, 'AbortError');
    await share().click();
    await expect.poll(() => shareCalls(page)).toBe(1); // the cancelled share has been handled
    await expect(share()).toBeVisible();
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(sheet.getByRole('status')).toHaveCount(0);
    await sheet.getByRole('button', { name: t('common.cancel'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(t('backup.never'))).toBeVisible();

    sheet = await openExport(page);
    await failNextShare(page, 'NotAllowedError');
    await share().click();
    await expect(sheet.getByRole('alert')).toHaveText(t('export.retry'));
    await share().click();
    await expect(sheet.getByRole('status')).toHaveText(t('export.shared'));
    expect(await sharedFiles(page)).toHaveLength(1);
  });

  test('a share that fails in another way offers the download instead', async ({ page }) => {
    await stubShare(page);
    await page.goto('./');
    const sheet = await openExport(page);
    await failNextShare(page, 'DataError');
    await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
    await expect(
      sheet.getByRole('button', { name: t('export.download'), exact: true }),
    ).toBeVisible();
    await expect(sheet.getByRole('button', { name: t('export.share'), exact: true })).toHaveCount(
      0,
    );
  });

  test('without file sharing the file is downloaded, and it counts only after "Yes"', async ({
    page,
  }) => {
    await removeShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    const sheet = await openExport(page);
    const download = sheet.getByRole('button', { name: t('export.download'), exact: true });

    const [first] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(first.suggestedFilename()).toMatch(/^qundaq-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(JSON.parse(await downloadedText(first))).toMatchObject({
      app: 'qundaq',
      babies: [{ name: 'Ada' }],
    });
    await expect(sheet).toContainText(t('export.savedQuestion'));
    await sheet.getByRole('button', { name: t('common.no'), exact: true }).click();
    await sheet.getByRole('button', { name: t('common.cancel'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(t('backup.never'))).toBeVisible();

    await page.getByRole('button', { name: t('export.title'), exact: true }).click();
    await Promise.all([page.waitForEvent('download'), download.click()]);
    await sheet.getByRole('button', { name: t('common.yes'), exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText(t('export.saved'));
    await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
    await expect(page.getByText(new RegExp(`^${escapeRegExp(lastBackupPrefix())}`))).toBeVisible();
  });
});

test.describe('CSV', () => {
  test.use({ timezoneId: 'Europe/Istanbul' });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-26T10:00:00+03:00') });
  });

  test('shares one file per baby with entries, plus pumping, as a Turkish spreadsheet; it is not a backup', async ({
    page,
  }) => {
    await stubShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'bottle').click();
    const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await pickTime(bottle, '2026-09-26T09:40');
    await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
    await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(bottle).toBeHidden();
    const pump = await openPump(page);
    await pump.getByRole('button', { name: t('pump.addMl'), exact: true }).click();
    await pumpMlField(pump, 'L').fill('60');
    await pump.getByRole('button', { name: t('note.add'), exact: true }).click();
    await pump.getByLabel(t('note.optional')).fill('=evening; "left"');
    await pump.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(pump).toBeHidden();

    await openTab(page, t('tab.settings'));
    await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
    const sheet = page.getByRole('dialog', { name: t('csv.title') });
    const pumpFile = `qundaq-${t('sheet.pump.title')}-2026-09-26.csv`;
    // Cal has no entries, so no file for Cal.
    await expect(sheet).toContainText(
      t('csv.contents', { n: 2, names: `qundaq-Ada-2026-09-26.csv, ${pumpFile}` }),
    );
    await sheet.getByRole('button', { name: t('export.share'), exact: true }).click();
    await expect(sheet.getByRole('status')).toHaveText(t('csv.shared'));

    const files = await sharedFiles(page);
    expect(files.map((file) => [file.name, file.type, file.bom])).toEqual([
      ['qundaq-Ada-2026-09-26.csv', 'text/csv', true],
      [pumpFile, 'text/csv', true],
    ]);
    const header = [
      t('csv.col.date'),
      t('csv.col.start'),
      t('csv.col.endDate'),
      t('csv.col.endTime'),
      t('csv.col.minutes'),
      t('csv.col.type'),
      t('csv.col.detail'),
      t('csv.col.note'),
    ].join(';');
    expect(files[0]!.text).toBe(
      `${header}\r\n2026-09-26;09:40;;;;${t('sheet.bottle.title')};${t('unit.ml', { ml: 90 })} · ${t('bottle.breastmilk')};\r\n`,
    );
    // The note is quoted (it holds ";" and quotes) and cannot run as a formula.
    expect(files[1]!.text).toContain(
      `;${t('sheet.pump.title')};${t('side.L.button')} ${t('unit.ml', { ml: 60 })};"'=evening; ""left"""\r\n`,
    );

    await sheet.getByRole('button', { name: t('common.ok'), exact: true }).click();
    await expect(page.getByText(t('backup.never'))).toBeVisible();
  });

  test('without file sharing, each file has its own download button', async ({ page }) => {
    await removeShare(page);
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { baby: 'Ada' });
    await logDiaper(page, { baby: 'Cal' });
    await openTab(page, t('tab.settings'));
    await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
    const sheet = page.getByRole('dialog', { name: t('csv.title') });
    for (const name of ['qundaq-Ada-2026-09-26.csv', 'qundaq-Cal-2026-09-26.csv']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        sheet
          .getByRole('button', { name: t('export.downloadNamed', { name }), exact: true })
          .click(),
      ]);
      expect(download.suggestedFilename()).toBe(name);
      expect(await downloadedText(download)).toContain(
        `${t('csv.col.date')};${t('csv.col.start')};`,
      );
    }
    await expect(sheet).not.toContainText(t('export.savedQuestion'));
  });
});
