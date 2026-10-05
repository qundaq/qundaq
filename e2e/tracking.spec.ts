import { expect, test } from '@playwright/test';
import { escapeRegExp, t } from './support/i18n';
import {
  addBabyInSettings,
  babyCard,
  cardAction,
  deleteBabyInSettings,
  logFeedAfterwards,
  logRows,
  openFeedEnd,
  openFeedStart,
  sideMinutesField,
  openTab,
  pickTime,
  readEvents,
} from './support/tracking';
import { DELETE_CONFIRM_MAX_MS } from '../src/ui/shared/confirm';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

const wetHeadline = t('tile.agoDetail', { detail: t('diaper.wet') });
const justNowWet = `${t('time.justNow')}`;

test.describe('babies', () => {
  test('first run shows an empty state and adds a baby from Home', async ({ page }) => {
    await expect(page.getByText(t('home.empty'))).toBeVisible();
    await page.getByRole('button', { name: t('babies.add'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('babies.formTitle.add') });
    await dialog.getByLabel(t('babies.name')).fill('Ada');
    await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(babyCard(page, 'Ada')).toBeVisible();
  });

  test('a blank name is refused with a message', async ({ page }) => {
    await page.getByRole('button', { name: t('babies.add'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('babies.formTitle.add') });
    await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(t('rule.name-required'));
    await expect(dialog).toBeVisible();
  });

  test('a birth date can be cleared', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    const row = page.getByRole('listitem').filter({ hasText: 'Ada' });
    await row.getByRole('button', { name: t('babies.edit') }).click();
    let dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
    await dialog.getByLabel(t('babies.birthDate')).fill('2026-09-01');
    await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(dialog).toBeHidden();

    await row.getByRole('button', { name: t('babies.edit') }).click();
    dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
    await expect(dialog.getByLabel(t('babies.birthDate'))).toHaveValue('2026-09-01');
    await dialog.getByLabel(t('babies.birthDate')).fill('');
    await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(dialog).toBeHidden();

    await row.getByRole('button', { name: t('babies.edit') }).click();
    dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
    await expect(dialog.getByLabel(t('babies.birthDate'))).toHaveValue('');
  });

  test('babies can be renamed and deleted in Settings', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');

    await page
      .getByRole('listitem')
      .filter({ hasText: 'Ada' })
      .getByRole('button', { name: t('babies.edit') })
      .click();
    const dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
    await dialog.getByLabel(t('babies.name')).fill('Ada Nora');
    await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Ada Nora' })).toBeVisible();

    await deleteBabyInSettings(page, 'Cal');

    await openTab(page, t('tab.home'));
    await expect(babyCard(page, 'Ada Nora')).toBeVisible();
    await expect(babyCard(page, 'Cal')).toHaveCount(0);
  });

  test('an armed delete tap that times out does not delete the baby', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T10:00:00') });
    await page.goto('./');
    await addBabyInSettings(page, 'Ada');

    const row = page.getByRole('listitem').filter({ hasText: 'Ada' });
    await row.getByRole('button', { name: t('babies.edit') }).click();
    const dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
    const remove = dialog.getByRole('button', {
      name: new RegExp(
        `^(${escapeRegExp(t('babies.delete'))}|${escapeRegExp(t('babies.deleteConfirm'))})$`,
      ),
    });
    await remove.click();
    await expect(remove).toHaveText(t('babies.deleteConfirm'));

    await page.clock.fastForward(DELETE_CONFIRM_MAX_MS + 1000);
    await expect(remove).toHaveText(t('babies.delete'));

    // The dialog is still open, nothing was deleted.
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: t('common.cancel'), exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();
    await openTab(page, t('tab.home'));
    await expect(babyCard(page, 'Ada')).toBeVisible();
  });
});

test('a failure to read the data is shown, not swallowed', async ({ page }) => {
  await page.addInitScript(() => {
    // Break every index read (the baby list is read through the createdAt index).
    IDBIndex.prototype.getAll = function () {
      throw new DOMException('Simulated read failure', 'UnknownError');
    };
    IDBIndex.prototype.openCursor = function () {
      throw new DOMException('Simulated read failure', 'UnknownError');
    };
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(t('error.loadFailed'));
});

function countDiapers(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('events', 'readonly');
          const getAll = tx.objectStore('events').getAll();
          getAll.onsuccess = () => {
            const events = getAll.result as Array<{ type: string }>;
            db.close();
            resolve(events.filter((event) => event.type === 'diaper').length);
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
  );
}

test.describe('diapers', () => {
  test('a dirty diaper with a pale stool shows the biliary-atresia warning and lands on the card', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await sheet.getByRole('radio', { name: t('diaper.both.button'), exact: true }).click();
    await sheet.getByRole('radio', { name: t('stool.color.white'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText(t('stool.alert.pale'));
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(justNowWet);
    await expect(card).toContainText(t('diaper.both'));
  });

  test('two submits in the same instant store only one diaper', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    // Both submits run before React can re-render, so a guard kept only in state would let both through.
    await sheet.locator('form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(sheet).toBeHidden();
    await expect(babyCard(page, 'Ada')).toContainText(justNowWet);
    await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
    expect(await countDiapers(page)).toBe(1);
  });

  test('a sheet left open while the phone was locked still logs at the moment of saving', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T03:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await page.clock.fastForward('20:00');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(babyCard(page, 'Ada')).toContainText(justNowWet);
    await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
  });

  test('a time the user picked is kept, and "Now" goes back to now', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T03:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    let sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await pickTime(sheet, '2026-09-25T02:15');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText(t('time.minutes', { m: 45 }));
    await expect(babyCard(page, 'Ada')).toContainText(wetHeadline);

    await cardAction(page, 'diaper').click();
    sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await pickTime(sheet, '2026-09-25T02:30');
    await sheet.getByRole('radio', { name: t('sheet.now'), exact: true }).click();
    await page.clock.fastForward('05:00');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText(justNowWet);
    await expect(babyCard(page, 'Ada')).toContainText(t('diaper.wet'));
  });

  test('colored swatches and cards cause no CSP violations', async ({ page }) => {
    await page.addInitScript(() => {
      const store: string[] = [];
      (window as unknown as { __cspViolations: string[] }).__cspViolations = store;
      document.addEventListener('securitypolicyviolation', (e) =>
        store.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await sheet.getByRole('radio', { name: t('diaper.dirty.button'), exact: true }).click();
    await sheet.getByRole('radio', { name: t('stool.color.yellow'), exact: true }).click();
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(babyCard(page, 'Ada')).toContainText(t('diaper.dirty'));
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations).toEqual([]);
  });

  test('double-clicking the save button stores only one diaper', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).dblclick();
    await expect(sheet).toBeHidden();

    const diaperCount = await countDiapers(page);
    expect(diaperCount).toBe(1);
  });
});

test.describe('timers and feeds', () => {
  test('breastfeeding timer: start on the left, switch, finish', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));

    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await sheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();
    const card = babyCard(page, 'Ada');
    const feedingL = t('strip.feeding', { side: t('side.L.button') });
    await expect(card).toContainText(feedingL);
    await expect(card.getByTestId('live-text')).toContainText(t('time.minutes', { m: 0 }));

    await page.clock.fastForward('06:00');
    await expect(card.getByTestId('live-text')).toContainText(t('time.minutes', { m: 6 }));
    await card.getByRole('button', { name: t('timer.switchSide') }).click();
    const feedingR = t('strip.feeding', { side: t('side.R.button') });
    await expect(card).toContainText(feedingR);

    await page.clock.fastForward('04:00');
    await card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) }).click();
    await expect(card).toContainText(t('time.minutes', { m: 10 }));
    await expect(card).toContainText(t('tile.agoDetail', { detail: t('side.R') }));
    await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(
      0,
    );
  });

  test('double-tapping the "end breastfeed" button shows no error and finishes the feed', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    await page
      .getByRole('dialog', { name: t('sheet.breastfeed.title') })
      .getByRole('button', { name: t('side.L.button'), exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));

    await page.clock.fastForward('05:00');
    await card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) }).dblclick();
    await expect(card).toContainText(t('time.minutes', { m: 5 }));
    await expect(card).toContainText(t('tile.agoDetail', { detail: t('side.L') }));
    await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(
      0,
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('double-tapping the "switch side" button switches only once', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await sheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));

    await page.clock.fastForward('03:00');
    await card.getByRole('button', { name: t('timer.switchSide') }).dblclick();
    await expect(card).toContainText(t('strip.feeding', { side: t('side.R.button') }));
    // Let any late second write land before checking it did not flip back.
    await page.clock.fastForward('00:10');
    await expect(card).toContainText(t('strip.feeding', { side: t('side.R.button') }));
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a feed and a sleep running for different babies get their own rows; finishing the feed leaves the sleep', async ({
    page,
  }) => {
    // A baby can no longer have a running sleep and a running feed at once (Plan 8 §6.3), so this uses two
    // babies: Ada sleeps, Cal feeds. That still exercises a feed row and a sleep row rendered together,
    // each one's own layout, and that finishing a timer never touches another baby's running timer.
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    await page
      .getByRole('dialog', { name: t('sheet.sleep.title') })
      .getByRole('button', { name: t('sheet.startSleep'), exact: true })
      .click(); // Ada, the default

    await cardAction(page, 'breastfeed', 'Cal').click();
    const feedSheet = page.getByRole('dialog', {
      name: new RegExp(`${escapeRegExp(t('sheet.breastfeed.title'))} · Cal$`),
    });
    await feedSheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();

    const adaCard = babyCard(page, 'Ada');
    const calCard = babyCard(page, 'Cal');
    const asleepHeadline = t('strip.asleep', { time: '' }).split(' ·')[0]!;
    await expect(adaCard).toContainText(asleepHeadline);
    await expect(calCard).toContainText(t('strip.feeding', { side: t('side.L.button') }));

    // Every timer button names the baby, so a screen reader never has to guess which twin it is for.
    const switchSide = calCard.getByRole('button', {
      name: `Cal: ${t('timer.switchSide')}`,
      exact: true,
    });
    const finishFeed = calCard.getByRole('button', {
      name: `Cal: ${t('timer.stopFeed')}`,
      exact: true,
    });
    const wakeUp = adaCard.getByRole('button', {
      name: `Ada: ${t('timer.wakeUp')}`,
      exact: true,
    });
    await expect(switchSide).toHaveText(t('timer.side'));
    await expect(finishFeed).toHaveText(t('timer.stop'));
    await expect(wakeUp).toHaveText(t('timer.wakeUp'));

    const feedRow = calCard
      .getByTestId('timer-row')
      .filter({ has: page.getByRole('button', { name: `Cal: ${t('timer.stopFeed')}` }) });
    const sleepRow = adaCard
      .getByTestId('timer-row')
      .filter({ has: page.getByRole('button', { name: `Ada: ${t('timer.wakeUp')}` }) });
    await expect(feedRow).toBeVisible();
    await expect(sleepRow).toBeVisible();
    await expect(feedRow.getByRole('button')).toHaveCount(2);
    await expect(sleepRow.getByRole('button')).toHaveCount(1);

    const [a, b, c] = await Promise.all([
      switchSide.boundingBox(),
      finishFeed.boundingBox(),
      wakeUp.boundingBox(),
    ]);
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(8);
    for (const box of [a!, b!, c!]) expect(box.height).toBeGreaterThanOrEqual(48);

    await finishFeed.click();
    await expect(finishFeed).toHaveCount(0);
    await expect(adaCard).toContainText(asleepHeadline);
    await expect(wakeUp).toBeVisible();
  });

  test('a running sleep survives a reload and can be ended', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    await page
      .getByRole('dialog', { name: t('sheet.sleep.title') })
      .getByRole('button', { name: t('sheet.startSleep'), exact: true })
      .click();
    const startedCard = babyCard(page, 'Ada');
    const asleepHeadline = t('strip.asleep', { time: '' }).split(' ·')[0]!;
    await expect(startedCard).toContainText(asleepHeadline);
    await expect(startedCard.getByTestId('live-text')).toContainText(t('time.minutes', { m: 0 }));

    await page.reload();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(asleepHeadline);
    await card.getByRole('button', { name: t('timer.wakeUp') }).click();
    await expect(card).toContainText(t('time.minutes', { m: 0 }));
    await expect(card).toContainText(t('tile.awake'));
  });

  test('the sleep sheet of a sleeping baby wakes it at a chosen time', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep', 'Ada').click();
    await page
      .getByRole('dialog', { name: t('sheet.sleep.title') })
      .getByRole('button', { name: t('sheet.startSleep'), exact: true })
      .click();
    await page.clock.fastForward('20:00');

    // Opened again for Ada, the sheet stops her sleep: her name in the title, no baby chips.
    await cardAction(page, 'sleep', 'Ada').click();
    const sheet = page.getByRole('dialog', { name: `${t('sheet.sleep.title')} · Ada` });
    await expect(sheet.getByTestId('live-text')).toContainText(t('time.minutes', { m: 20 }));
    await expect(sheet.getByRole('button', { name: 'Cal', exact: true })).toHaveCount(0);
    await expect(sheet.getByRole('radiogroup', { name: t('time.woke') })).toBeVisible();
    // Before she fell asleep: refused, and the sheet stays open.
    await sheet.getByRole('radio', { name: t('time.agoChip', { m: 30 }), exact: true }).click();
    await sheet.getByRole('button', { name: t('timer.wakeUp'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t('rule.end-before-start'));
    await sheet.getByRole('radio', { name: t('time.agoChip', { m: 5 }), exact: true }).click();
    await sheet.getByRole('button', { name: t('timer.wakeUp'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByText(t('toast.wokeUp', { who: 'Ada', duration: t('time.minutes', { m: 15 }) })),
    ).toBeVisible();
    await expect(babyCard(page, 'Ada')).toContainText(t('tile.awake'));
    // Five minutes before the tap, 20 minutes (and a few real milliseconds) after she fell asleep.
    const [sleep] = await readEvents(page);
    const slept = (sleep!.endAt as number) - (sleep!.startAt as number);
    expect(slept).toBeGreaterThanOrEqual(15 * 60_000);
    expect(slept).toBeLessThan(16 * 60_000);
  });

  test('the feed sheet of a feeding baby switches the side and finishes the feed', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    await page
      .getByRole('dialog', { name: t('sheet.breastfeed.title') })
      .getByRole('button', { name: t('side.L.button'), exact: true })
      .click();
    await page.clock.fastForward('03:00');

    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: `${t('sheet.breastfeed.title')} · Ada` });
    await expect(sheet).toContainText(t('strip.feeding', { side: t('side.L.button') }));
    await sheet.getByRole('button', { name: t('timer.switchSide'), exact: true }).click();
    // The switch keeps the sheet open, showing the new side.
    await expect(sheet).toContainText(t('strip.feeding', { side: t('side.R.button') }));
    await expect(sheet.getByRole('radiogroup', { name: t('time.end') })).toBeVisible();
    await sheet.getByRole('button', { name: t('timer.stop'), exact: true }).click();
    await expect(sheet).toBeHidden();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('tile.agoDetail', { detail: t('side.R') }));
    await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(
      0,
    );
  });

  test('the feed sheet starts on the side due next and says when the other was last used', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    let sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    const side = (key: 'side.L.button' | 'side.R.button') =>
      sheet.getByRole('button', { name: t(key), exact: true });
    // No history: left is next, and right has never been used.
    await expect(side('side.L.button')).toHaveAccessibleDescription(t('side.next'));
    await expect(side('side.R.button')).toHaveAccessibleDescription('');
    for (const key of ['side.L.button', 'side.R.button'] as const)
      expect((await side(key).boundingBox())!.height).toBeGreaterThanOrEqual(72);
    await side('side.L.button').click();
    await expect(sheet).toBeHidden();
    await page.clock.fastForward('05:00');
    await babyCard(page, 'Ada')
      .getByRole('button', { name: new RegExp(t('timer.stopFeed')) })
      .click();

    await cardAction(page, 'breastfeed').click();
    sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await expect(side('side.R.button')).toHaveAccessibleDescription(t('side.next'));
    await expect(side('side.L.button')).toHaveAccessibleDescription(
      t('side.lastUsed', { ago: t('time.ago', { duration: t('time.minutes', { m: 5 }) }) }),
    );
  });

  test('a finished feed or sleep needs a duration', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await sheet.getByRole('radio', { name: t('sheet.mode.doneSleep'), exact: true }).click();
    await expect(sheet.getByLabel(t('sheet.durationMinutes'))).toHaveCount(0);
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t('sheet.durationRequired'));
    // "Other…" reveals the minutes field, which stays while it is emptied.
    await sheet.getByRole('radio', { name: t('sheet.durationOther'), exact: true }).click();
    const minutes = sheet.getByLabel(t('sheet.durationMinutes'));
    await minutes.fill('25');
    await minutes.fill('');
    await expect(minutes).toBeVisible();
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t('sheet.durationRequired'));
    expect(await readEvents(page)).toHaveLength(0);
  });

  test('starting a feed ends a running sleep and the other way round, and the sheet says so first', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    const card = babyCard(page, 'Ada');
    await cardAction(page, 'sleep').click();
    let sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await expect(sheet.getByText(t('conflict.feedEnds', { names: 'Ada' }))).toHaveCount(0);
    await sheet.getByRole('button', { name: t('sheet.startSleep'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await page.clock.fastForward('30:00');

    await cardAction(page, 'breastfeed').click();
    sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    // Said once, above the side buttons that start the feed.
    await expect(sheet.getByText(t('conflict.sleepEnds', { names: 'Ada' }))).toHaveCount(1);
    await sheet.getByRole('button', { name: t('side.L.button'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));
    await expect(card.getByRole('button', { name: new RegExp(t('timer.wakeUp')) })).toHaveCount(0);
    await page.clock.fastForward('10:00');

    await cardAction(page, 'sleep').click();
    sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await expect(sheet.getByText(t('conflict.feedEnds', { names: 'Ada' }))).toBeVisible();
    await sheet.getByRole('button', { name: t('sheet.startSleep'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(
      0,
    );
    await expect(card.getByRole('button', { name: new RegExp(t('timer.wakeUp')) })).toBeVisible();

    // Each timer ended the moment the next one started.
    const events = (await readEvents(page)).sort(
      (a, b) => (a.startAt as number) - (b.startAt as number),
    );
    expect(events.map((event) => event.type)).toEqual(['sleep', 'breastfeed', 'sleep']);
    expect(events[0]!.endAt).toBe(events[1]!.startAt);
    expect(events[1]!.endAt).toBe(events[2]!.startAt);
    expect(events[2]).not.toHaveProperty('endAt');
  });

  test('a feed with a duration is saved as finished, ending at the chosen time', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await logFeedAfterwards(sheet, { right: 15 });
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('time.minutes', { m: 15 }));
    await expect(card).toContainText(t('tile.agoDetail', { detail: t('side.R') }));
    await expect(card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) })).toHaveCount(
      0,
    );
  });

  test('one tap on the right side starts the feed there, and it finishes', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await sheet.getByRole('button', { name: t('side.R.button'), exact: true }).click();
    await expect(sheet).toBeHidden();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('strip.feeding', { side: t('side.R.button') }));
    await page.clock.fastForward('07:00');
    await card.getByRole('button', { name: new RegExp(t('timer.stopFeed')) }).click();
    await expect(card).toContainText(t('time.minutes', { m: 7 }));
    await expect(card).toContainText(t('tile.agoDetail', { detail: t('side.R') }));
  });

  test('the first "switch side" tap right after the start switches at once; the button then rests', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    await page
      .getByRole('dialog', { name: t('sheet.breastfeed.title') })
      .getByRole('button', { name: t('side.L.button'), exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));

    // No time passes: this tap used to fall inside the double-tap window and do nothing.
    const switchSide = card.getByRole('button', { name: t('timer.switchSide') });
    await switchSide.click();
    await expect(card).toContainText(t('strip.feeding', { side: t('side.R.button') }));
    // A second tap now would be the other half of a double tap: the button shows it is resting.
    await expect(switchSide).toBeDisabled();
    await page.clock.fastForward(2100);
    await expect(switchSide).toBeEnabled();
    await switchSide.click();
    await expect(card).toContainText(t('strip.feeding', { side: t('side.L.button') }));
  });

  test('after a switch on Home, the stop sheet opened within the window shows its switch resting too', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    await page
      .getByRole('dialog', { name: t('sheet.breastfeed.title') })
      .getByRole('button', { name: t('side.L.button'), exact: true })
      .click();
    await page.clock.fastForward('05:00');
    const card = babyCard(page, 'Ada');
    await card.getByRole('button', { name: t('timer.switchSide') }).click();
    await expect(card).toContainText(t('strip.feeding', { side: t('side.R.button') }));

    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: `${t('sheet.breastfeed.title')} · Ada` });
    const switchSide = sheet.getByRole('button', { name: t('timer.switchSide'), exact: true });
    // Within the window a tap would be ignored, so the sheet's button says so instead of doing nothing.
    await expect(switchSide).toBeDisabled();
    await page.clock.fastForward(2100);
    await expect(switchSide).toBeEnabled();
    await switchSide.click();
    await expect(sheet).toContainText(t('strip.feeding', { side: t('side.L.button') }));
    await expect(sheet).toContainText(
      `${t('side.L.button')} ${t('time.minutes', { m: 5 })} · ${t('side.R.button')}`,
    );
  });

  test('a feed logged afterwards with left 10 and right 5 minutes shows both sides in the log', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-25T08:00:00') });
    await page.reload();
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    const save = sheet.getByRole('button', { name: t('common.save'), exact: true });
    await expect(save).toBeDisabled();
    await expect(sheet.getByText(t('sheet.durationRequired'))).toBeVisible();
    const left = t('side.L.button');
    const right = t('side.R.button');
    // Left by a quick chip, right by one "+" step (an empty side starts at 5).
    await sheet
      .getByRole('group', { name: left, exact: true })
      .getByRole('radio', { name: t('time.minutes', { m: 10 }), exact: true })
      .click();
    await sheet.getByRole('button', { name: t('sideMinutes.more', { side: right, m: 5 }) }).click();
    await expect(sideMinutesField(sheet, 'R')).toHaveValue('5');
    await expect(sheet.getByText(t('sheet.durationRequired'))).toHaveCount(0);
    await save.click();
    await expect(sheet).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).first()).toContainText('07:45 – 08:00');
    await expect(logRows(page).first()).toContainText(
      `${left} ${t('time.minutes', { m: 10 })} · ${right} ${t('time.minutes', { m: 5 })}`,
    );
    const [feed] = (await readEvents(page)) as { segments: { side: string }[] }[];
    expect(feed!.segments.map((segment) => segment.side)).toEqual(['L', 'R']);
  });

  test('the feed sheet fits a 320 px screen: nothing overflows, every control is 48 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    // Save sits a short scroll away at most: the whole sheet scrolls less than 200 px.
    await expect(sheet.getByRole('button', { name: t('common.save'), exact: true })).toBeVisible();
    expect(
      await sheet.evaluate((dialog) => dialog.scrollHeight - dialog.clientHeight),
    ).toBeLessThan(200);
    await sheet
      .getByRole('button', { name: t('sideMinutes.more', { side: t('side.L.button'), m: 5 }) })
      .click();
    await openFeedStart(sheet);
    await openFeedEnd(sheet);
    const overflow = await sheet.evaluate((dialog) => {
      const right = dialog.getBoundingClientRect().right;
      return [...dialog.querySelectorAll('button, input')]
        .filter((el) => el.getBoundingClientRect().right > right + 0.5)
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(overflow).toEqual([]);
    expect(await sheet.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    const small = await sheet.evaluate((dialog) =>
      [...dialog.querySelectorAll('button')]
        .filter((el) => el.getBoundingClientRect().height < 47.5)
        .map((el) => el.textContent),
    );
    expect(small).toEqual([]);
  });

  test('minutes show three digits in full, and both sides together stop at the 4 hour limit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    const left = sideMinutesField(sheet, 'L');
    await left.fill('120');
    await expect(left).toHaveValue('120');
    expect(await left.evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true);
    await left.fill('200');
    const right = sideMinutesField(sheet, 'R');
    await right.fill('100');
    // 240 minutes in all: the right side gets what the left leaves.
    await expect(right).toHaveValue('40');
    await expect(
      sheet.getByRole('button', {
        name: t('sideMinutes.more', { side: t('side.R.button'), m: 5 }),
      }),
    ).toBeDisabled();
    // The longest feed the rule allows (4 hours) saves; the rule stays the safety net behind it.
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    const [feed] = (await readEvents(page)) as { startAt: number; endAt: number }[];
    expect(feed!.endAt - feed!.startAt).toBe(240 * 60_000);
  });

  test('a bottle without an amount is refused', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'bottle').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t('rule.amount-invalid'));
  });
});

test.describe('sheet defaults and saved fields', () => {
  test("a card's sheet has no baby picker: it is always that card's own baby, even after a reload", async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    const titled = (name: string) =>
      page.getByRole('dialog', {
        name: new RegExp(`${escapeRegExp(t('sheet.diaper.title'))} · ${name}$`),
      });

    await cardAction(page, 'diaper', 'Ada').click();
    let sheet = titled('Ada');
    await expect(sheet.getByRole('group', { name: t('sheet.babies') })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Cal', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    // Opening from Cal's card is Cal's sheet, never a memory of the one just used.
    await cardAction(page, 'diaper', 'Cal').click();
    sheet = titled('Cal');
    await expect(sheet.getByRole('button', { name: 'Ada', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    // And it survives a reload too: still the card's own baby, not whatever was open before.
    await page.reload();
    await cardAction(page, 'diaper', 'Ada').click();
    sheet = titled('Ada');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).filter({ hasText: 'Ada' })).toHaveCount(2);
    await expect(logRows(page).filter({ hasText: 'Cal' })).toHaveCount(1);
  });

  test('turning "Dirty" off again saves no stool details', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await sheet.getByRole('radio', { name: t('diaper.dirty.button'), exact: true }).click();
    await sheet.getByRole('radio', { name: t('stool.color.white'), exact: true }).click();
    await sheet.getByRole('radio', { name: t('consistency.watery'), exact: true }).click();
    // Back to "Wet" (not "Dirty" again, which no longer toggles off a Segmented choice).
    await sheet.getByRole('radio', { name: t('diaper.wet.button'), exact: true }).click();
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    const events = await readEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'diaper', wet: true, dirty: false });
    expect(events[0]).not.toHaveProperty('stoolColor');
    expect(events[0]).not.toHaveProperty('consistency');
  });

  test('stool and baby colors are native radio buttons', async ({ page }) => {
    await openTab(page, t('tab.settings'));
    await page.getByRole('button', { name: t('babies.add'), exact: true }).click();
    const form = page.getByRole('dialog', { name: t('babies.formTitle.add') });
    // Real <input type="radio">, one group name, so the arrow keys move the choice natively.
    const colorRadios = form.locator('input[type="radio"]');
    await expect(colorRadios).toHaveCount(6);
    expect(
      await colorRadios.evaluateAll(
        (els) => new Set(els.map((el) => (el as HTMLInputElement).name)).size,
      ),
    ).toBe(1);
    await form.getByRole('radio', { name: t('color.pink'), exact: true }).check();
    await expect(form.getByRole('radio', { name: t('color.pink'), exact: true })).toBeChecked();
    await form.getByRole('radio', { name: t('color.pink'), exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(form.getByRole('radio', { name: t('color.green'), exact: true })).toBeChecked();
    await form.getByLabel(t('babies.name')).fill('Ada');
    await form.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(form).toBeHidden();

    await openTab(page, t('tab.home'));
    await cardAction(page, 'diaper').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
    await sheet.getByRole('radio', { name: t('diaper.dirty.button'), exact: true }).click();
    const stoolRadios = sheet.locator('input[type="radio"]');
    await expect(stoolRadios).toHaveCount(9);
    expect(
      await stoolRadios.evaluateAll(
        (els) => new Set(els.map((el) => (el as HTMLInputElement).name)).size,
      ),
    ).toBe(1);
    await sheet.getByRole('radio', { name: t('stool.color.mustard'), exact: true }).check();
    await expect(
      sheet.getByRole('radio', { name: t('stool.color.mustard'), exact: true }),
    ).toBeChecked();
    await expect(
      sheet.getByRole('radio', { name: t('stool.color.yellow'), exact: true }),
    ).not.toBeChecked();
  });

  test('a closing sheet keeps its title and form until it is gone', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    // Record every committed state in which an open sheet has no form or an empty title.
    await page.evaluate(() => {
      const empty: string[] = [];
      (window as unknown as { __emptySheets: string[] }).__emptySheets = empty;
      new MutationObserver(() => {
        for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')) {
          const title = dialog.querySelector('h2')?.textContent ?? '';
          if (dialog.open && (!dialog.querySelector('form') || title === '')) empty.push(title);
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    });
    await cardAction(page, 'diaper').click();
    await page
      .getByRole('dialog', { name: t('sheet.diaper.title') })
      .getByRole('button', { name: t('common.save'), exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: t('sheet.diaper.title') })).toBeHidden();
    await cardAction(page, 'bottle').click();
    await page
      .getByRole('dialog', { name: t('sheet.bottle.title') })
      .getByRole('button', { name: t('common.dismiss'), exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: t('sheet.bottle.title') })).toBeHidden();
    expect(
      await page.evaluate(() => (window as unknown as { __emptySheets: string[] }).__emptySheets),
    ).toEqual([]);
  });
});
