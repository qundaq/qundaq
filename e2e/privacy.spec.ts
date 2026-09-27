import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { fakeAudio, soundStatus, tile } from './support/audio';
import {
  downloadedText,
  pickBackupFile,
  removeShare,
  stubShare,
  takeBackup,
} from './support/backup';
import { addBabyInSettings, logDiaper, openTab } from './support/tracking';

test('production build ships the strict CSP', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/unsafe-(inline|eval)/);
});

test('using the app triggers no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await fakeAudio(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: t('nav.label') });
  for (const name of [t('tab.log'), t('tab.summary'), t('tab.sounds'), t('tab.settings')]) {
    await nav.getByRole('button', { name, exact: true }).click();
  }
  // Playing a sound, saving a mix, playing it from the list and opening the source list stay inside the
  // policy (no inline styles, same-origin fetch).
  await nav.getByRole('button', { name: t('tab.sounds'), exact: true }).click();
  await tile(page, t('sound.rain')).click();
  const playingWord = t('sounds.status.playing', { names: '' }).split(' ·')[0]!;
  await expect(soundStatus(page)).toContainText(playingWord);
  await page.getByRole('button', { name: t('sounds.saveMix'), exact: true }).click();
  const mixSheet = page.getByRole('dialog', { name: t('sounds.saveMix') });
  await mixSheet.getByLabel(t('sounds.mix.name')).fill('Night');
  await mixSheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(mixSheet).toBeHidden();
  const mixRow = page.getByRole('listitem').filter({ hasText: 'Night' });
  await mixRow
    .getByRole('button', { name: t('sounds.mix.play', { name: 'Night' }), exact: true })
    .click();
  await expect(soundStatus(page)).toContainText(
    t('sounds.status.playing', { names: t('sound.rain') }),
  );
  await nav.getByRole('button', { name: t('tab.settings'), exact: true }).click();
  await page.getByRole('button', { name: t('settings.sources'), exact: true }).click();
  const sources = page.getByRole('dialog', { name: t('settings.sources') });
  await expect(sources).toContainText('Paul Kellet');
  await sources.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  const nightSwitch = page.getByRole('switch');
  await nightSwitch.click();
  await expect(nightSwitch).toBeChecked();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('backing up, exporting CSV and restoring trigger no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page);
  const backup = await takeBackup(page);
  await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
  const csv = page.getByRole('dialog', { name: t('csv.title') });
  await csv.getByRole('button', { name: t('export.share'), exact: true }).click();
  await csv.getByRole('button', { name: t('common.ok'), exact: true }).click();
  const restore = await pickBackupFile(page, backup);
  await restore.getByRole('button', { name: t('import.mode.replace'), exact: true }).click();
  await restore
    .getByRole('checkbox', {
      name: t('import.confirmReplace'),
    })
    .check();
  await restore.getByRole('button', { name: t('import.applyReplace'), exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText(
    t('import.done.replace', { babies: 1, events: 1 }),
  );
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('the download fallback for the backup and the CSV triggers no CSP violations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
    document.addEventListener('securitypolicyviolation', (e) =>
      store.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await removeShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logDiaper(page);
  await openTab(page, t('tab.settings'));
  await page.getByRole('button', { name: t('export.title'), exact: true }).click();
  const backup = page.getByRole('dialog', { name: t('export.title') });
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: t('export.download'), exact: true }).click(),
  ]);
  expect(JSON.parse(await downloadedText(json))).toMatchObject({ app: 'qundaq' });
  await backup.getByRole('button', { name: t('common.yes'), exact: true }).click();
  await backup.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await page.getByRole('button', { name: t('csv.title'), exact: true }).click();
  const csv = page.getByRole('dialog', { name: t('csv.title') });
  // One baby, one file: a single download button.
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    csv.getByRole('button', { name: t('export.download'), exact: true }).click(),
  ]);
  expect(await downloadedText(file)).toContain(`${t('csv.col.date')};${t('csv.col.start')};`);
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});
