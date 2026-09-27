import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { fakeAudio, fakeAudioRecord, soundStatus, tile } from './support/audio';
import { clearAppData, pickBackupFile, stubShare, takeBackup } from './support/backup';
import { addBabyInSettings, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NIGHT = new Date('2026-09-26T22:00:00+03:00');
const playing = (names: string) =>
  `${t('sounds.status.playing', { names })} · ${t('sounds.remaining', { m: 60 })}`;

test('two sounds play, the status names them, and the now-playing bar on Home pauses them above the card actions', async ({
  page,
}) => {
  await fakeAudio(page);
  await page.goto('./');
  // Enough cards that Home overflows the viewport on both projects' devices: the bar must stay
  // clear of the last card's actions once the page is scrolled all the way to the bottom, not just
  // while the actions sit comfortably above an unscrolled fold.
  for (const name of ['Ada', 'Cal', 'Dan', 'Eve', 'Zoe']) await addBabyInSettings(page, name);
  await openTab(page, t('tab.sounds'));
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await expect(page.getByRole('button', { name: t('sounds.play'), exact: true })).toBeDisabled();

  await tile(page, t('sound.white')).click();
  await expect(tile(page, t('sound.white'))).toHaveAttribute('aria-pressed', 'true');
  await expect(soundStatus(page)).toHaveText(playing(t('sound.white')));
  // VoiceOver reads the state changes; the countdown stays out of the live region, or it is read every minute.
  await expect(soundStatus(page).locator('[aria-live="polite"]')).toHaveText(
    t('sounds.status.playing', { names: t('sound.white') }),
  );
  await expect(page.getByLabel(t('sounds.level', { name: t('sound.white') }))).toHaveValue('0.7');
  await tile(page, t('sound.rain')).click();
  await expect(soundStatus(page)).toHaveText(playing(`${t('sound.white')} + ${t('sound.rain')}`));
  // Both loops generated (the status does not wait for them): one context, resumed in the tap, two sources.
  await expect(tile(page, t('sound.white'))).not.toContainText(t('sounds.preparing'));
  await expect(tile(page, t('sound.rain'))).not.toContainText(t('sounds.preparing'));
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 1, resumes: 1, sources: 2 });

  // A seventh sound is refused with a message.
  for (const key of ['sound.pink', 'sound.brown', 'sound.waves', 'sound.wind'] as const)
    await tile(page, t(key)).click();
  await tile(page, t('sound.shush')).click();
  await expect(page.getByRole('status').filter({ hasText: t('sounds.full') })).toHaveText(
    t('sounds.full'),
  );
  await expect(tile(page, t('sound.shush'))).toHaveAttribute('aria-pressed', 'false');

  await openTab(page, t('tab.home'));
  const bar = page.getByRole('region', { name: t('nowplaying.label') });
  await expect(bar).toContainText(
    t('sounds.status.playing', { names: `${t('sound.white')} + ${t('sound.rain')}` }),
  );
  // Scrolled all the way down, the last card's actions must still clear the fixed bar above the tab
  // bar: that headroom comes from the screen's own bottom padding (App.module.css,
  // --nowplaying-h), not from the actions merely sitting off-screen above an unscrolled fold.
  const lastActions = page.getByRole('group', { name: t('card.actions', { name: 'Zoe' }) });
  await expect(lastActions).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight))
    .toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const actions = await lastActions.boundingBox();
  const barBox = await bar.boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(barBox!.y + 1);
  await bar.getByRole('button', { name: t('sounds.pause'), exact: true }).click();
  await expect(bar).toContainText(t('sounds.status.paused'));
  await bar.getByRole('button', { name: t('sounds.play'), exact: true }).click();
  await expect(bar).toContainText(t('sounds.status.playing', { names: '' }).split(' ·')[0]!);
  const playingWord = t('sounds.status.playing', { names: '' }).split(' ·')[0]!;
  await bar.getByRole('button', { name: new RegExp(playingWord) }).click(); // the text opens the Sounds tab
  await expect(page.getByRole('heading', { level: 1, name: t('tab.sounds') })).toBeAttached();
  await expect(bar).toHaveCount(0);
});

test('the 15-minute timer counts down and stops the sound; play restarts it with the same chip; the selection survives a reload', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await expect(
    page.getByRole('radio', { name: t('sounds.timer.minutes', { m: 60 }), exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page
    .getByRole('radio', { name: t('sounds.timer.minutes', { m: 15 }), exact: true })
    .click();
  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.playing', { names: t('sound.white') })} · ${t('sounds.remaining', { m: 15 })}`,
  );
  await page.getByLabel(t('sounds.master'), { exact: true }).fill('0.3');

  await page.clock.fastForward(14 * 60_000);
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.playing', { names: t('sound.white') })} · ${t('sounds.remaining', { m: 1 })}`,
  );
  // Pausing does not stop the countdown.
  await page.getByRole('button', { name: t('sounds.pause'), exact: true }).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.paused')} · ${t('sounds.remaining', { m: 1 })}`,
  );
  await page.clock.fastForward(70_000);
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await expect(tile(page, t('sound.white'))).toHaveAttribute('aria-pressed', 'true');
  expect(await fakeAudioRecord(page)).toMatchObject({ suspends: 1 });

  await page.getByRole('button', { name: t('sounds.play'), exact: true }).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.playing', { names: t('sound.white') })} · ${t('sounds.remaining', { m: 15 })}`,
  );
  await page.getByRole('radio', { name: t('sounds.timer.none'), exact: true }).click();
  await expect(soundStatus(page)).toHaveText(
    t('sounds.status.playing', { names: t('sound.white') }),
  );
  await page.clock.fastForward(60 * 60_000);
  await expect(soundStatus(page)).toHaveText(
    t('sounds.status.playing', { names: t('sound.white') }),
  );

  // The selection, the master and the chip come back after a reload; nothing plays by itself.
  await page.reload();
  await openTab(page, t('tab.sounds'));
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await expect(tile(page, t('sound.white'))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(t('sounds.master'), { exact: true })).toHaveValue('0.3');
  await expect(
    page.getByRole('radio', { name: t('sounds.timer.none'), exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 0 });
});

test('a mix is saved, plays after a reload from the list, and can be renamed and deleted with two taps', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await expect(page.getByRole('button', { name: t('sounds.saveMix'), exact: true })).toBeDisabled();
  await tile(page, t('sound.white')).click();
  await tile(page, t('sound.rain')).click();
  await page.getByLabel(t('sounds.level', { name: t('sound.rain') })).fill('0.4');
  await page.getByRole('button', { name: t('sounds.saveMix'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('sounds.saveMix') });
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(t('rule.name-required'));
  await sheet.getByLabel(t('sounds.mix.name')).fill('Night');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: 'Night' });
  await expect(row).toContainText(`${t('sound.white')} + ${t('sound.rain')}`);

  await page.getByRole('button', { name: t('sounds.pause'), exact: true }).click();
  await tile(page, t('sound.white')).click(); // off while paused: the selection changes, nothing starts
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.paused')} · ${t('sounds.remaining', { m: 60 })}`,
  );
  await page.reload();
  await openTab(page, t('tab.sounds'));
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await page
    .getByRole('button', { name: t('sounds.mix.play', { name: 'Night' }), exact: true })
    .click();
  await expect(soundStatus(page)).toHaveText(playing(`${t('sound.white')} + ${t('sound.rain')}`));
  await expect(page.getByLabel(t('sounds.level', { name: t('sound.rain') }))).toHaveValue('0.4');

  await row.getByRole('button', { name: `Night: ${t('sounds.mix.rename')}`, exact: true }).click();
  const rename = page.getByRole('dialog', { name: t('sounds.mix.renameTitle') });
  await rename.getByLabel(t('sounds.mix.name')).fill('Deep sleep');
  await rename.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(rename).toBeHidden();
  const renamed = page.getByRole('listitem').filter({ hasText: 'Deep sleep' });
  await expect(renamed).toBeVisible();
  await renamed
    .getByRole('button', { name: `Deep sleep: ${t('edit.delete')}`, exact: true })
    .click();
  await page.clock.fastForward(1000);
  await renamed
    .getByRole('button', { name: `Deep sleep: ${t('edit.deleteConfirm')}`, exact: true })
    .click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Deep sleep' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: t('sounds.mixes') })).toHaveCount(0);
  const playingWord = t('sounds.status.playing', { names: '' }).split(' ·')[0]!;
  await expect(soundStatus(page)).toContainText(playingWord); // deleting the mix leaves the sound alone
});

test('on a 320 px screen a mix row keeps its name readable and 16 px between rename and delete', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.white')).click();
  await page.getByRole('button', { name: t('sounds.saveMix'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('sounds.saveMix') });
  await sheet.getByLabel(t('sounds.mix.name')).fill('Night');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByRole('listitem').filter({ hasText: 'Night' });
  const name = (await row
    .getByRole('button', { name: t('sounds.mix.play', { name: 'Night' }), exact: true })
    .boundingBox())!;
  const rename = (await row
    .getByRole('button', { name: `Night: ${t('sounds.mix.rename')}`, exact: true })
    .boundingBox())!;
  const remove = row.getByRole('button', { name: new RegExp(`^Night: ${t('edit.delete')}`) });
  const check = async () => {
    const box = (await remove.boundingBox())!;
    const apart = Math.max(
      box.x - (rename.x + rename.width),
      rename.x - (box.x + box.width),
      box.y - (rename.y + rename.height),
      rename.y - (box.y + box.height),
    );
    expect(apart).toBeGreaterThanOrEqual(16);
  };
  await check();
  expect(name.width).toBeGreaterThanOrEqual(200);
  await remove.click(); // armed: the longer delete-confirm label still keeps its distance
  await expect(remove).toHaveAccessibleName(`Night: ${t('edit.deleteConfirm')}`);
  await check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('a saved mix travels in the backup and comes back in a restore', async ({ page }) => {
  await fakeAudio(page);
  await stubShare(page);
  await page.goto('./');
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.shush')).click();
  await page.getByRole('button', { name: t('sounds.saveMix'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('sounds.saveMix') });
  await sheet.getByLabel(t('sounds.mix.name')).fill('Night');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  const backup = await takeBackup(page);
  const parsed = JSON.parse(backup) as {
    schemaVersion: number;
    mixes: { name: string; layers: unknown[] }[];
  };
  expect(parsed.schemaVersion).toBe(2);
  expect(parsed.mixes).toEqual([
    {
      id: expect.any(String),
      name: 'Night',
      layers: [{ soundId: 'shush', gain: 0.7 }],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    },
  ]);
  expect(backup).not.toContain('volumeCap');
  expect(backup).not.toContain('lastSound');

  await clearAppData(page);
  const restore = await pickBackupFile(page, backup);
  const mixesRow = restore
    .getByTestId('import-counts')
    .locator('> div')
    .filter({ hasText: t('import.mixes') });
  const fullCounts = t('import.counts', { add: 1, update: 0, remove: 0, same: 0, keep: 0 });
  const countsPrefix = fullCounts.slice(0, fullCounts.lastIndexOf(' · '));
  await expect(mixesRow).toContainText(countsPrefix);
  await restore.getByRole('button', { name: t('import.applyMerge'), exact: true }).click();
  await expect(restore.getByRole('status')).toHaveText(
    t('import.done.merge', { added: 0, updated: 0, removed: 0, moved: 0 }),
  );
  await restore.getByRole('button', { name: t('common.ok'), exact: true }).click();
  await openTab(page, t('tab.sounds'));
  await expect(page.getByRole('listitem').filter({ hasText: 'Night' })).toContainText(
    t('sound.shush'),
  );
  await page
    .getByRole('button', { name: t('sounds.mix.play', { name: 'Night' }), exact: true })
    .click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.shush')));
});

test('raising the cap warns and never makes the sound louder; the sound sources open in-app', async ({
  page,
}) => {
  // A paused clock: the selection's persist timer and the cap's save fire only when the test says so.
  await page.clock.install({ time: NIGHT });
  await page.clock.pauseAt(new Date(NIGHT.getTime() + 60_000));
  await fakeAudio(page);
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toContainText(
    t('sounds.status.playing', { names: '' }).split(' ·')[0]!,
  );
  await expect(page.getByLabel(t('sounds.master'), { exact: true })).toHaveValue('0.6');
  await expect(page.getByText(t('sounds.safety'))).toBeVisible();

  await openTab(page, t('tab.settings'));
  const cap = page.getByLabel(t('settings.cap.title'));
  await expect(cap).toHaveValue('0.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The cap's write waits behind another connection while the selection's persist timer (set by the tile
  // tap, master 0.6) comes due: whatever that timer writes lands after the cap, so it must be the lowered master.
  await holdSettingsWrites(page);
  await cap.fill('1');
  await expect(page.getByRole('alert')).toContainText(t('settings.cap.warning').split(';')[0]!);
  await page.clock.runFor(1500);
  await releaseSettingsWrites(page);
  // The master slider drops so that the sound stays as loud as it was (R1); the headroom is there to be used.
  await openTab(page, t('tab.sounds'));
  await expect(page.getByLabel(t('sounds.master'), { exact: true })).toHaveValue('0.3');
  await expect(soundStatus(page)).toContainText(
    t('sounds.status.playing', { names: '' }).split(' ·')[0]!,
  );
  expect(await storedCapAndMaster(page)).toEqual({ volumeCap: 1, master: 0.3 });
  // A launch right after restores them as a pair.
  await page.reload();
  await openTab(page, t('tab.sounds'));
  await expect(page.getByLabel(t('sounds.master'), { exact: true })).toHaveValue('0.3');
  await openTab(page, t('tab.settings'));
  await expect(cap).toHaveValue('1');

  await expect(page.getByRole('alert')).toBeVisible();
  await cap.fill('0.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await openTab(page, t('tab.home')); // leaving the card saves a move that is still pending
  await openTab(page, t('tab.settings'));
  await expect(cap).toHaveValue('0.5');
  await page.reload();
  await openTab(page, t('tab.settings'));
  await expect(cap).toHaveValue('0.5');

  await page.getByRole('button', { name: t('settings.sources'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: t('settings.sources') });
  await expect(sheet).toContainText(`| pink | ${t('sound.pink')} / Pink noise |`);
  await expect(sheet).toContainText('Paul Kellet');
  await sheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  await expect(sheet).toBeHidden();
});

test('a lower cap chosen while the previous move is still being saved is kept', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await page.clock.pauseAt(new Date(NIGHT.getTime() + 60_000));
  await page.goto('./');
  await openTab(page, t('tab.settings'));
  const cap = page.getByLabel(t('settings.cap.title'));
  await expect(cap).toHaveValue('0.5');
  // The first move's save starts and waits; the finger moves on before it lands.
  await holdSettingsWrites(page);
  await cap.fill('0.4');
  await page.clock.runFor(300);
  await cap.fill('0.3');
  await releaseSettingsWrites(page);
  await expect.poll(() => storedCapAndMaster(page)).toMatchObject({ volumeCap: 0.4 });
  await expect(cap).toHaveValue('0.3');
  await page.clock.runFor(300);
  await expect.poll(() => storedCapAndMaster(page)).toMatchObject({ volumeCap: 0.3 });
  await expect(cap).toHaveValue('0.3');
});

test('the real AudioContext builds the graph and plays without errors', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'One real-context check is enough; headless WebKit on the CI runner may not run Web Audio (R11)',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.heartbeat')).click();
  await tile(page, t('sound.rain')).click();
  await expect(soundStatus(page)).toHaveText(
    playing(`${t('sound.heartbeat')} + ${t('sound.rain')}`),
  );
  await expect(tile(page, t('sound.rain'))).not.toContainText(t('sounds.preparing'));
  await page.getByLabel(t('sounds.level', { name: t('sound.rain') })).fill('0.2');
  await page
    .getByRole('radio', { name: t('sounds.timer.minutes', { m: 15 }), exact: true })
    .click();
  await page.getByRole('button', { name: t('sounds.pause'), exact: true }).click();
  await expect(soundStatus(page)).toContainText(t('sounds.status.paused'));
  await page.getByRole('button', { name: t('sounds.play'), exact: true }).click();
  await expect(soundStatus(page)).toContainText(
    t('sounds.status.playing', { names: '' }).split(' ·')[0]!,
  );
  expect(await page.evaluate(() => 'AudioContext' in window && !('__fakeAudio' in window))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

/** A second connection holds a read-write transaction on the settings, so the app's writes queue behind it. */
function holdSettingsWrites(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('qundaq');
        open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
        open.onsuccess = () => {
          const store = open.result.transaction('settings', 'readwrite').objectStore('settings');
          const hold = () => {
            if (!(window as unknown as { __release?: boolean }).__release)
              store.get('none').onsuccess = hold;
          };
          hold();
          resolve();
        };
      }),
  );
}

function releaseSettingsWrites(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __release?: boolean }).__release = true;
  });
}

/**
 * The stored cap and master, read in a transaction opened after every write the app has queued, so it sees
 * them all (IndexedDB runs overlapping transactions in the order they were created).
 */
function storedCapAndMaster(page: Page): Promise<{ volumeCap: unknown; master: unknown }> {
  return page.evaluate(
    () =>
      new Promise<{ volumeCap: unknown; master: unknown }>((resolve, reject) => {
        const open = indexedDB.open('qundaq');
        open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const getAll = db.transaction('settings', 'readonly').objectStore('settings').getAll();
          getAll.onsuccess = () => {
            db.close();
            const [row] = getAll.result as {
              volumeCap?: unknown;
              lastSound?: { master?: unknown };
            }[];
            resolve({ volumeCap: row?.volumeCap, master: row?.lastSound?.master });
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
  );
}
