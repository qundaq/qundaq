import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { fakeAudio, fakeAudioRecord, soundStatus, stubSoundFiles, tile } from './support/audio';
import { addBabyInSettings, openTab } from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

const NIGHT = new Date('2026-09-26T22:00:00+03:00');
const playing = (name: string) =>
  `${t('sounds.status.playing', { name })} · ${t('sounds.remaining', { m: 60 })}`;
const endsWithPlay = new RegExp(`${t('sounds.play')}$`);

test('one sound plays at a time; the tile is the play control; the now-playing bar on Home pauses it above the card actions', async ({
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
  await expect(page.getByRole('button', { name: t('sounds.play'), exact: true })).toHaveCount(0);

  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.white')));
  // VoiceOver reads the state changes; the countdown stays out of the live region, or it is read every minute.
  await expect(soundStatus(page).locator('[aria-live="polite"]')).toHaveText(
    t('sounds.status.playing', { name: t('sound.white') }),
  );
  // The status does not wait for the file: the tile settles out of loading once the source has started.
  await expect(tile(page, t('sound.white'))).toHaveAttribute('data-state', 'playing');
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 1, resumes: 1, sources: 1 });

  // One voice: Wind chimes replaces White (the old one fades, the new one starts).
  await tile(page, t('sound.windchime')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.windchime')));
  await expect.poll(async () => (await fakeAudioRecord(page)).sources).toBe(2);
  await expect(tile(page, t('sound.white'))).toHaveAccessibleName(endsWithPlay);

  await tile(page, t('sound.windchime')).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.paused')} · ${t('sounds.remaining', { m: 60 })}`,
  );
  // The paused tile stays marked: it is the one a tap resumes.
  await expect(tile(page, t('sound.windchime'))).toHaveAttribute('data-state', 'paused');
  await expect(tile(page, t('sound.windchime'))).toHaveAccessibleName(
    t('sounds.tile', { name: t('sound.windchime'), action: t('sounds.resume') }),
  );
  await tile(page, t('sound.windchime')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.windchime')));

  await openTab(page, t('tab.home'));
  const bar = page.getByRole('region', { name: t('nowplaying.label') });
  await expect(bar).toContainText(t('sounds.status.playing', { name: t('sound.windchime') }));
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
  await expect(bar).toContainText(t('sounds.status.playing', { name: t('sound.windchime') }));
  await bar
    .getByRole('button', {
      name: new RegExp(t('sounds.status.playing', { name: t('sound.windchime') })),
    })
    .click(); // the text opens the Sounds tab
  await expect(page.getByRole('heading', { level: 1, name: t('tab.sounds') })).toBeAttached();
  await expect(bar).toHaveCount(0);
});

test('the 15-minute timer counts down and stops the sound; the tile restarts it with the same chip; the master and the chip survive a reload and nothing plays by itself', async ({
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
  const white = t('sounds.status.playing', { name: t('sound.white') });
  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(`${white} · ${t('sounds.remaining', { m: 15 })}`);
  await page.getByLabel(t('sounds.master'), { exact: true }).fill('0.3');

  await page.clock.fastForward(14 * 60_000);
  await expect(soundStatus(page)).toHaveText(`${white} · ${t('sounds.remaining', { m: 1 })}`);
  // Pausing does not stop the countdown.
  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(
    `${t('sounds.status.paused')} · ${t('sounds.remaining', { m: 1 })}`,
  );
  await page.clock.fastForward(70_000);
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  expect(await fakeAudioRecord(page)).toMatchObject({ suspends: 1 });

  await tile(page, t('sound.white')).click();
  await expect(soundStatus(page)).toHaveText(`${white} · ${t('sounds.remaining', { m: 15 })}`);
  await page.getByRole('radio', { name: t('sounds.timer.none'), exact: true }).click();
  await expect(soundStatus(page)).toHaveText(white);
  await page.clock.fastForward(60 * 60_000);
  await expect(soundStatus(page)).toHaveText(white);

  // The master and the chip come back after a reload; nothing plays by itself (a stopped tile reads off).
  await page.reload();
  await openTab(page, t('tab.sounds'));
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await expect(tile(page, t('sound.white'))).toHaveAttribute('data-state', 'off');
  await expect(tile(page, t('sound.white'))).toHaveAccessibleName(endsWithPlay);
  await expect(page.getByLabel(t('sounds.master'), { exact: true })).toHaveValue('0.3');
  await expect(
    page.getByRole('radio', { name: t('sounds.timer.none'), exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(await fakeAudioRecord(page)).toMatchObject({ contexts: 0 });
});

test('a sound whose file is missing is dimmed, says so, does nothing, and the other sounds still play', async ({
  page,
}) => {
  await fakeAudio(page, { missing: ['windchime'] });
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.windchime')).click();
  await expect(tile(page, t('sound.windchime'))).toContainText(t('sounds.unavailable'));
  await expect(tile(page, t('sound.windchime'))).toHaveAttribute('aria-disabled', 'true');
  await expect(soundStatus(page)).toHaveText(t('sounds.status.stopped'));
  await tile(page, t('sound.windchime')).click({ force: true }); // aria-disabled: Playwright would wait
  expect(await fakeAudioRecord(page)).toMatchObject({ sources: 0 });

  await tile(page, t('sound.waves')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.waves')));
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
    t('sounds.status.playing', { name: t('sound.white') }),
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
    t('sounds.status.playing', { name: t('sound.white') }),
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
  await expect(sheet).toContainText('| white.m4a |');
  await expect(sheet).toContainText('| waves.m4a |');
  await expect(sheet).toContainText('| windchime.m4a |');
  await expect(sheet).toContainText('| airplane.m4a |');
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

test('a move back to the stored cap while a higher one is being saved is saved too', async ({
  page,
}) => {
  await page.clock.install({ time: NIGHT });
  await page.clock.pauseAt(new Date(NIGHT.getTime() + 60_000));
  await page.goto('./');
  await openTab(page, t('tab.settings'));
  const cap = page.getByLabel(t('settings.cap.title'));
  await expect(cap).toHaveValue('0.5');
  await holdSettingsWrites(page);
  await cap.fill('0.8');
  await page.clock.runFor(300);
  // The finger returns to the stored value before the first save lands.
  await cap.fill('0.5');
  await page.clock.runFor(300);
  await releaseSettingsWrites(page);
  await expect.poll(() => storedCapAndMaster(page)).toMatchObject({ volumeCap: 0.5 });
  await expect(cap).toHaveValue('0.5');
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
  await stubSoundFiles(page);
  await page.goto('./');
  await openTab(page, t('tab.sounds'));
  await tile(page, t('sound.windchime')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.windchime')));
  await expect(tile(page, t('sound.windchime'))).toHaveAttribute('data-state', 'playing');
  await tile(page, t('sound.waves')).click();
  await expect(soundStatus(page)).toHaveText(playing(t('sound.waves')));
  await page
    .getByRole('radio', { name: t('sounds.timer.minutes', { m: 15 }), exact: true })
    .click();
  await tile(page, t('sound.waves')).click();
  await expect(soundStatus(page)).toContainText(t('sounds.status.paused'));
  await tile(page, t('sound.waves')).click();
  await expect(soundStatus(page)).toContainText(
    t('sounds.status.playing', { name: t('sound.waves') }),
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
