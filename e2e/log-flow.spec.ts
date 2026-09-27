import { expect, test, type Page } from '@playwright/test';
import { escapeRegExp, t } from './support/i18n';
import { babyIdOf, putRawEvent } from './support/backup';
import {
  addBabyInSettings,
  babyCard,
  cardAction,
  openOther,
  openTab,
  pickTime,
  readEvents,
} from './support/tracking';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

/** Every test needs two babies on Home, per this task's brief. */
async function twoBabies(page: Page) {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
}

test('a card action opens its own sheet, titled for that baby, with no baby picker: a care type and an Other type', async ({
  page,
}) => {
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Cal').click();
  const diaper = page.getByRole('dialog', {
    name: new RegExp(`${escapeRegExp(t('sheet.diaper.title'))} · Cal$`),
  });
  await expect(diaper.getByRole('group', { name: t('sheet.babies') })).toHaveCount(0);
  await expect(diaper.getByRole('button', { name: 'Ada', exact: true })).toHaveCount(0);
  await diaper.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  await expect(diaper).toBeHidden();

  const medication = await openOther(page, 'medication', 'Ada');
  await expect(
    page.getByRole('dialog', {
      name: new RegExp(`${escapeRegExp(t('sheet.medication.title'))} · Ada$`),
    }),
  ).toBeVisible();
  await expect(medication.getByRole('group', { name: t('sheet.babies') })).toHaveCount(0);
  await expect(medication.getByRole('button', { name: 'Cal', exact: true })).toHaveCount(0);
});

test('a bottle is logged in two taps and remembers the last amount', async ({ page }) => {
  await twoBabies(page);

  await cardAction(page, 'bottle', 'Ada').click();
  let sheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
  await sheet.getByLabel(t('sheet.amount')).fill('120');
  await sheet.getByRole('radio', { name: t('bottle.formula'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(t('toast.bottle', { who: 'Ada', ml: 120 }))).toBeVisible();

  await cardAction(page, 'bottle', 'Ada').click();
  sheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
  await expect(sheet.getByText(t('bottle.last', { ml: 120 }))).toBeVisible();
  await expect(sheet.getByLabel(t('sheet.amount'))).toHaveValue('120');
  await expect(sheet.getByRole('radio', { name: t('bottle.formula'), exact: true })).toBeChecked();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(t('toast.bottle', { who: 'Ada', ml: 120 }))).toBeVisible();

  const bottles = (await readEvents(page)).filter(
    (event) => event.type === 'bottle' && event.ml === 120 && event.contents === 'formula',
  );
  expect(bottles).toHaveLength(2);
});

test('a sleep ticks in seconds, stops with one tap, and undo brings it back running', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 8, 27, 21, 0) });
  await page.reload();
  await twoBabies(page);

  await cardAction(page, 'sleep', 'Ada').click();
  await page
    .getByRole('dialog', { name: t('sheet.sleep.title') })
    .getByRole('button', { name: t('sheet.startSleep'), exact: true })
    .click();
  const card = babyCard(page, 'Ada');
  // The installed clock also ticks with real time (pausing it would stall the app's own timers), so a
  // reading allows a few real seconds on top of the time run below.
  await expect(card.getByTestId('live-text')).toContainText(/0:0\d/);
  await page.clock.runFor(65_000);
  await expect(card.getByTestId('live-text')).toContainText(/1:0\d/);

  await card.getByRole('button', { name: `Ada: ${t('timer.wakeUp')}`, exact: true }).click();
  await expect(
    page.getByText(t('toast.wokeUp', { who: 'Ada', duration: t('time.minutes', { m: 1 }) })),
  ).toBeVisible();
  await page.getByRole('button', { name: t('common.undo'), exact: true }).click();
  await expect(
    card.getByRole('button', { name: `Ada: ${t('timer.wakeUp')}`, exact: true }),
  ).toBeVisible();

  const [sleep] = (await readEvents(page)).filter((event) => event.type === 'sleep');
  expect(sleep).not.toHaveProperty('endAt');
});

test('the undo toast stays while its button has focus, and goes once focus leaves', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 8, 27, 9, 0) });
  await page.reload();
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  const undo = page.getByRole('button', { name: t('common.undo'), exact: true });
  await undo.focus();
  await page.clock.runFor(20_000);
  await expect(undo).toBeVisible();

  await undo.blur();
  await page.clock.runFor(8_000);
  await expect(undo).toBeHidden();
});

test('starting a feed ends a running sleep, and undo restores both', async ({ page }) => {
  await twoBabies(page);

  await cardAction(page, 'sleep', 'Ada').click();
  await page
    .getByRole('dialog', { name: t('sheet.sleep.title') })
    .getByRole('button', { name: t('sheet.startSleep'), exact: true })
    .click();
  const card = babyCard(page, 'Ada');
  await expect(card.getByTestId('timer-row')).toHaveCount(1);

  await cardAction(page, 'breastfeed', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
  await expect(sheet.getByText(t('conflict.sleepEnds', { names: 'Ada' }))).toBeVisible();
  await sheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByTestId('timer-row')).toHaveCount(1);
  await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));

  const beforeUndo = (await readEvents(page)) as {
    type: string;
    startAt: number;
    endAt?: number;
  }[];
  const sleepRow = beforeUndo.find((row) => row.type === 'sleep')!;
  const feedRow = beforeUndo.find((row) => row.type === 'breastfeed')!;
  expect(sleepRow.endAt).toBe(feedRow.startAt);

  await page.getByRole('button', { name: t('common.undo'), exact: true }).click();
  await expect(card.getByTestId('timer-row')).toHaveCount(1);
  await expect(card).toContainText(t('tile.asleep'));

  const afterUndo = await readEvents(page);
  expect(afterUndo.find((row) => row.type === 'sleep')).not.toHaveProperty('endAt');
  expect(afterUndo.find((row) => row.type === 'breastfeed')).toHaveProperty('deletedAt');
});

test('starting earlier than the running timer is refused', async ({ page }) => {
  await twoBabies(page);

  await cardAction(page, 'sleep', 'Ada').click();
  await page
    .getByRole('dialog', { name: t('sheet.sleep.title') })
    .getByRole('button', { name: t('sheet.startSleep'), exact: true })
    .click();

  await cardAction(page, 'breastfeed', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
  await sheet.getByRole('radio', { name: t('time.agoChip', { m: 15 }), exact: true }).click();
  await sheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(
    t('rule.running-overlap.named', { names: 'Ada' }),
  );
  await expect(sheet).toBeVisible();
});

test('a time chip and a picked time both store the exact instant chosen', async ({ page }) => {
  const at = new Date(2026, 8, 25, 10, 0, 0);
  await page.clock.install({ time: at });
  await page.reload();
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Ada').click();
  let sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('radio', { name: t('time.agoChip', { m: 15 }), exact: true }).click();
  // The clock ticks with real time once installed; pin it back to `at` so "the save instant" is exact.
  await page.clock.setFixedTime(at);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await cardAction(page, 'diaper', 'Ada').click();
  sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await pickTime(sheet, '2026-09-24T21:00');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  const diapers = (await readEvents(page))
    .filter((event) => event.type === 'diaper')
    .sort((a, b) => (a.startAt as number) - (b.startAt as number)) as { startAt: number }[];
  expect(diapers).toHaveLength(2);
  expect(diapers[0]!.startAt).toBe(new Date(2026, 8, 24, 21, 0).getTime());
  expect(diapers[1]!.startAt).toBe(at.getTime() - 15 * 60_000);
});

test('a finished breastfeed needs a duration too', async ({ page }) => {
  // The same rule is already covered for sleep (tracking.spec.ts, "a finished feed or sleep needs a
  // duration"); this is the breastfeed branch of it.
  await twoBabies(page);

  await cardAction(page, 'breastfeed', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
  await sheet.getByRole('radio', { name: t('sheet.mode.doneFeed'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(t('sheet.durationRequired'));
  await expect(sheet).toBeVisible();
  expect(await readEvents(page)).toHaveLength(0);
});

test('a running feed can be stopped from its own sheet at a chosen time', async ({ page }) => {
  await twoBabies(page);

  await cardAction(page, 'breastfeed', 'Ada').click();
  await page
    .getByRole('dialog', { name: t('sheet.breastfeed.title') })
    .getByRole('button', { name: t('side.R.button'), exact: true })
    .click();

  await cardAction(page, 'breastfeed', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: `${t('sheet.breastfeed.title')} · Ada` });
  await expect(
    sheet.getByRole('button', { name: t('timer.switchSide'), exact: true }),
  ).toBeVisible();
  await expect(sheet.getByRole('button', { name: t('timer.stop'), exact: true })).toBeVisible();

  // The feed just started, so ending it 5 minutes ago is before its own start.
  await sheet.getByRole('radio', { name: t('time.agoChip', { m: 5 }), exact: true }).click();
  await sheet.getByRole('button', { name: t('timer.stop'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(t('rule.end-before-start'));

  await sheet.getByRole('radio', { name: t('sheet.now'), exact: true }).click();
  await sheet.getByRole('button', { name: t('timer.stop'), exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(babyCard(page, 'Ada').getByTestId('timer-row')).toHaveCount(0);
});

test('diaper colours are labelled and grouped, warn before a bad one, and clear on a second tap', async ({
  page,
}) => {
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('radio', { name: t('diaper.dirty.button'), exact: true }).click();
  await expect(sheet.getByText(t('stool.askDoctor'))).toBeVisible();

  await sheet.getByRole('radio', { name: t('stool.color.clay'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText(t('stool.alert.pale'));

  await sheet.getByRole('radio', { name: t('stool.color.clay'), exact: true }).click();
  await expect(
    sheet.getByRole('radio', { name: t('stool.color.clay'), exact: true }),
  ).not.toBeChecked();
  await expect(sheet.getByRole('alert')).toHaveCount(0);

  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  // A dirty-only diaper (no "wet") is wet: false, dirty: true (controller ruling R10.b).
  const [diaper] = (await readEvents(page)).filter((event) => event.type === 'diaper') as {
    wet: boolean;
    dirty: boolean;
    stoolColor?: string;
  }[];
  expect(diaper).toMatchObject({ wet: false, dirty: true });
  expect(diaper).not.toHaveProperty('stoolColor');
});

test('the close button dismisses without saving and returns focus; so does swiping the sheet down', async ({
  page,
  browserName,
}) => {
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  await expect(sheet).toBeHidden();
  if (browserName !== 'webkit') {
    // WebKit does not focus a button on a tap or click (a long-standing Safari default), so there is
    // nothing for the dialog's native "return focus to the invoker" to return to there.
    await expect(cardAction(page, 'diaper', 'Ada')).toBeFocused();
  }

  test.skip(
    browserName === 'webkit',
    'The iPhone emulation delivers no pointer events for page.mouse here; the swipe is covered by device-checklist row 46.',
  );

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet2 = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  const title = sheet2.getByRole('heading', { name: t('sheet.diaper.title') });
  const box = (await title.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.up();
  await expect(sheet2).toBeHidden();
  expect(await readEvents(page)).toHaveLength(0);
});

test("a tap on the backdrop dismisses without saving; a tap in the sheet's own padding does not", async ({
  page,
}) => {
  await twoBabies(page);

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  const box = (await sheet.boundingBox())!;
  // The sheet's side padding (space-4) belongs to the dialog's box: the sheet stays open.
  await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
  await expect(sheet).toBeVisible();

  // Above the sheet is the backdrop: the sheet closes and nothing is written.
  await page.touchscreen.tap(box.x + box.width / 2, box.y / 2);
  await expect(sheet).toBeHidden();
  expect(await readEvents(page)).toHaveLength(0);
});

test('selecting text that ends on the backdrop keeps the sheet open', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'The iPhone emulation delivers no pointer events for page.mouse here; a touch cannot select across elements.',
  );
  await twoBabies(page);

  const sheet = await openOther(page, 'healthNote', 'Ada');
  const note = sheet.getByLabel(t('note.required'));
  await note.fill('Slept well after the bath');
  const noteBox = (await note.boundingBox())!;
  const sheetBox = (await sheet.boundingBox())!;
  // A mouse drag that starts in the note and ends on the backdrop: the browser fires its click on the
  // dialog, at a point outside its box, like a backdrop tap.
  await page.mouse.move(noteBox.x + noteBox.width - 8, noteBox.y + noteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sheetBox.x + sheetBox.width / 2, sheetBox.y / 2, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await expect(note).toHaveValue('Slept well after the bath');
});

test('a save that fails after its sheet was dismissed still shows its error', async ({ page }) => {
  await twoBabies(page);

  // Another connection holds the events store, so the sheet's save waits in line behind it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
        request.onsuccess = () => {
          const store = request.result.transaction('events', 'readwrite').objectStore('events');
          let held = true;
          (window as unknown as { releaseEvents: () => void }).releaseEvents = () => {
            held = false;
          };
          const spin = () => {
            if (held) store.count().onsuccess = spin;
          };
          store.count().onsuccess = () => {
            spin();
            resolve();
          };
        };
      }),
  );

  await cardAction(page, 'diaper', 'Ada').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.dismiss'), exact: true }).click();
  await expect(sheet).toBeHidden();

  // The write then fails, once the sheet's form is gone.
  await page.evaluate(() => {
    const fail = () => {
      throw new DOMException('Simulated write failure', 'UnknownError');
    };
    IDBObjectStore.prototype.put = fail;
    IDBObjectStore.prototype.add = fail;
    (window as unknown as { releaseEvents: () => void }).releaseEvents();
  });
  await expect(page.getByRole('alert')).toContainText(t('error.saveFailed'));
  expect(await readEvents(page)).toHaveLength(0);
});

test('the height budget: two running timers still fit above the tab bar on an iPhone XR', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'webkit',
    'The height budget (spec §4.4) targets the iPhone XR viewport.',
  );
  await twoBabies(page);
  await page.setViewportSize({ width: 414, height: 896 });

  await cardAction(page, 'sleep', 'Ada').click();
  await page
    .getByRole('dialog', { name: t('sheet.sleep.title') })
    .getByRole('button', { name: t('sheet.startSleep'), exact: true })
    .click();

  await cardAction(page, 'breastfeed', 'Cal').click();
  await page
    .getByRole('dialog', { name: t('sheet.breastfeed.title') })
    .getByRole('button', { name: t('side.L.button'), exact: true })
    .click();

  const group = page.getByRole('group', { name: t('card.actions', { name: 'Cal' }), exact: true });
  const box = (await group.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(896 - 64);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a card with two strips from legacy data (a running sleep and a running feed together) can stop either', async ({
  page,
}) => {
  // The one-timer-per-baby rule (spec §6.3) only guards new writes; data written before this plan (or
  // imported) can still leave both running at once. Home must show both strips and let either stop
  // (controller ruling R10.a).
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const babyId = await babyIdOf(page, 'Ada');
  const at = Date.now() - 10 * 60_000;
  await putRawEvent(page, {
    id: 'legacy-sleep',
    type: 'sleep',
    babyId,
    startAt: at,
    createdAt: at,
    updatedAt: at,
    open: 1,
  });
  await putRawEvent(page, {
    id: 'legacy-feed',
    type: 'breastfeed',
    babyId,
    startAt: at,
    segments: [{ side: 'L', start: at }],
    createdAt: at,
    updatedAt: at,
    open: 1,
  });
  await page.reload();
  await openTab(page, t('tab.home'));

  const card = babyCard(page, 'Ada');
  const rows = card.getByTestId('timer-row');
  await expect(rows).toHaveCount(2);
  const [sleepBox, feedBox] = await Promise.all([
    rows.nth(0).boundingBox(),
    rows.nth(1).boundingBox(),
  ]);
  expect(feedBox!.y - (sleepBox!.y + sleepBox!.height)).toBeGreaterThanOrEqual(8);

  await card.getByRole('button', { name: `Ada: ${t('timer.wakeUp')}`, exact: true }).click();
  await expect(rows).toHaveCount(1);
  await card.getByRole('button', { name: `Ada: ${t('timer.stopFeed')}`, exact: true }).click();
  await expect(rows).toHaveCount(0);
});
