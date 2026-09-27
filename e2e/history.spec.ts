import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { HOUR, MINUTE } from '../src/domain/time';
import { formatDuration } from '../src/ui/shared/format';
import {
  addBabyInSettings,
  babyCard,
  dayPicker,
  enterDuration,
  feedTile,
  filterGroup,
  logDiaper,
  logRows,
  openRow,
  openTab,
  cardAction,
  pickTime,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T10:00:00+03:00') });
  await page.goto('./');
});

const dayAndMonth = (day: number) =>
  new Intl.DateTimeFormat('tr', { day: 'numeric', month: 'long' }).format(
    new Date(2026, 8, day).getTime(),
  );
const asleepHeadline = t('strip.asleep', { time: '' }).split(' ·')[0]!;

test.describe('the log (history) list', () => {
  test('entries logged today appear newest first', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    // Explicit times: the clock keeps running while the test sets up, so "now" is not a fixed minute.
    await logDiaper(page, { at: '2026-09-25T09:40' });
    await cardAction(page, 'bottle').click();
    const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await pickTime(bottle, '2026-09-25T09:45');
    await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
    await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(dayPicker(page)).toContainText(t('day.today'));
    await expect(dayPicker(page).getByRole('button', { name: t('day.next') })).toBeDisabled();
    const rows = logRows(page);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('09:45');
    await expect(rows.nth(0)).toContainText(t('sheet.bottle.title'));
    await expect(rows.nth(0)).toContainText(
      `${t('unit.ml', { ml: 90 })} · ${t('bottle.breastmilk')}`,
    );
    await expect(rows.nth(1)).toContainText('09:40');
    await expect(rows.nth(1)).toContainText(t('diaper.wet.button'));
    // One baby: no baby filter.
    await expect(filterGroup(page, 'baby')).toHaveCount(0);
  });

  test('previous and next day, the date field, and never the old day under the new heading', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { at: '2026-09-24T21:00' });
    await logDiaper(page, { at: '2026-09-25T09:00' });
    await openTab(page, t('tab.log'));
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('09:00');

    // Record every rendered state of the day heading and the rows while switching days.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __logStates: string[] }).__logStates = seen;
      new MutationObserver(() => {
        const day = document.querySelector('[data-testid="day-current"]')?.textContent ?? '';
        const rows = Array.from(
          document.querySelectorAll('[data-testid="log-list"] li'),
          (li) => li.textContent ?? '',
        );
        seen.push(`${day}|${rows.join('#')}`);
      }).observe(document.querySelector('main')!, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await dayPicker(page)
      .getByRole('button', { name: t('day.previous') })
      .click();
    await expect(dayPicker(page)).toContainText(t('day.yesterday'));
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('21:00');
    const states = await page.evaluate(
      () => (window as unknown as { __logStates: string[] }).__logStates,
    );
    const yesterday = t('day.yesterday');
    // The observer really saw the new day's row (not just an empty selector match).
    expect(states.some((state) => state.startsWith(yesterday) && state.includes('21:00'))).toBe(
      true,
    );
    expect(
      states.filter((state) => state.startsWith(yesterday) && state.includes('09:00')),
    ).toEqual([]);

    await dayPicker(page)
      .getByRole('button', { name: t('day.next') })
      .click();
    await expect(dayPicker(page)).toContainText(t('day.today'));

    await dayPicker(page).getByLabel(t('day.choose')).fill('2026-09-20');
    await expect(dayPicker(page)).toContainText(dayAndMonth(20));
    await expect(page.getByText(t('log.empty'))).toBeVisible();
    await dayPicker(page).getByLabel(t('day.choose')).fill('2026-09-30');
    await expect(dayPicker(page)).toContainText(t('day.today'));
  });

  test('baby and type filters, kept across tab switches', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { baby: 'Ada' });
    await logDiaper(page, { baby: 'Cal' });
    await cardAction(page, 'bottle', 'Ada').click();
    const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
    await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page)).toHaveCount(3);
    await filterGroup(page, 'baby').getByRole('button', { name: 'Ada', exact: true }).click();
    await expect(logRows(page)).toHaveCount(2);
    await filterGroup(page, 'type')
      .getByRole('button', { name: t('log.type.diaper'), exact: true })
      .click();
    await expect(logRows(page)).toHaveCount(1);
    await filterGroup(page, 'type')
      .getByRole('button', { name: t('log.type.sleep'), exact: true })
      .click();
    await expect(page.getByText(t('log.emptyFiltered'))).toBeVisible();

    await openTab(page, t('tab.home'));
    await openTab(page, t('tab.log'));
    await expect(
      filterGroup(page, 'baby').getByRole('button', { name: 'Ada', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      filterGroup(page, 'type').getByRole('button', { name: t('log.type.sleep'), exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await filterGroup(page, 'baby')
      .getByRole('button', { name: t('sheet.all'), exact: true })
      .click();
    await filterGroup(page, 'type')
      .getByRole('button', { name: t('log.type.all'), exact: true })
      .click();
    await expect(logRows(page)).toHaveCount(3);
  });

  test('a sleep across midnight shows on both days with the other day marked', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    const sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await enterDuration(sheet, 500);
    await pickTime(sheet, '2026-09-25T06:30');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).first()).toContainText(
      `22:10 ${t('log.suffix.previousDay')} – 06:30`,
    );
    await dayPicker(page)
      .getByRole('button', { name: t('day.previous') })
      .click();
    await expect(logRows(page).first()).toContainText(`22:10 – 06:30 ${t('log.suffix.nextDay')}`);
  });
});

test.describe('editing and deleting', () => {
  test('a bottle: amount, time and a note', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page);
    await cardAction(page, 'bottle').click();
    const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
    await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(bottle).toBeHidden();

    await openTab(page, t('tab.log'));
    await openRow(page, t('sheet.bottle.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.bottle.title')}`,
    });
    await sheet.getByLabel(t('sheet.amount')).fill('120');
    await sheet.getByLabel(t('sheet.time')).fill('2026-09-25T09:30');
    await sheet.getByLabel(t('note.optional')).fill('Spat up half of it');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();

    const rows = logRows(page);
    await expect(rows.nth(0)).toContainText(t('diaper.wet.button'));
    await expect(rows.nth(1)).toContainText('09:30');
    await expect(rows.nth(1)).toContainText(`120 ml · ${t('bottle.breastmilk')}`);
    await expect(rows.nth(1)).toContainText('Spat up half of it');
    await openTab(page, t('tab.home'));
    await expect(feedTile(page, 'Ada')).toContainText('120 ml');
  });

  test('deleting takes two taps; a double tap does not delete', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'bottle').click();
    const bottle = page.getByRole('dialog', { name: t('sheet.bottle.title') });
    await bottle.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
    await bottle.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(feedTile(page, 'Ada')).toContainText('90 ml');

    await openTab(page, t('tab.log'));
    await openRow(page, t('sheet.bottle.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.bottle.title')}`,
    });
    const remove = sheet.getByRole('button', {
      name: new RegExp(`^(${t('edit.delete')}|${t('edit.deleteConfirm')})$`),
    });
    await remove.dblclick();
    await expect(remove).toHaveText(t('edit.deleteConfirm'));
    await expect(sheet).toBeVisible();
    await page.clock.fastForward(5000);
    await expect(remove).toHaveText(t('edit.delete'));

    await remove.click();
    await expect(remove).toHaveText(t('edit.deleteConfirm'));
    await page.clock.fastForward(1000);
    await remove.click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(t('log.empty'))).toBeVisible();
    await openTab(page, t('tab.home'));
    await expect(babyCard(page, 'Ada')).not.toContainText(t('sheet.bottle.title').toLowerCase());
  });

  test('Cancel and Esc wait for a save in flight', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { at: '2026-09-25T09:40' });
    await openTab(page, t('tab.log'));
    await openRow(page, t('sheet.diaper.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.diaper.title')}`,
    });
    await sheet.getByLabel(t('note.optional')).fill('Diaper rash cream');

    // A second connection holds a read-write transaction on the events, so the app's save has to wait.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('qundaq');
          open.onerror = () => reject(open.error ?? new Error('indexedDB open failed'));
          open.onsuccess = () => {
            const store = open.result.transaction('events', 'readwrite').objectStore('events');
            const hold = () => {
              if (!(window as unknown as { __release?: boolean }).__release)
                store.get('none').onsuccess = hold;
            };
            hold();
            resolve();
          };
        }),
    );
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(
      sheet.getByRole('button', { name: t('common.cancel'), exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __release?: boolean }).__release = true;
    });
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('Diaper rash cream');
  });

  test("a finished feed's sides and minutes can be changed", async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const feed = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await enterDuration(feed, 15);
    await pickTime(feed, '2026-09-25T09:50');
    await feed.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(feed).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).first()).toContainText('09:35 – 09:50');
    await expect(logRows(page).first()).toContainText(
      `${t('side.L.button')} ${t('time.minutes', { m: 15 })}`,
    );
    await openRow(page, t('sheet.breastfeed.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.breastfeed.title')}`,
    });
    await sheet
      .getByRole('group', { name: t('edit.segment', { n: 1 }) })
      .getByLabel(t('edit.minutes'))
      .fill('12');
    await sheet.getByRole('button', { name: t('edit.addSegment'), exact: true }).click();
    await sheet
      .getByRole('group', { name: t('edit.segment', { n: 2 }) })
      .getByLabel(t('edit.minutes'))
      .fill('3');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('09:35 – 09:50');
    await expect(logRows(page).first()).toContainText(
      `${t('side.L.button')} ${t('time.minutes', { m: 12 })} · ${t('side.R.button')} ${t('time.minutes', { m: 3 })}`,
    );
  });

  test('an edit that breaks a rule says why and keeps the sheet open', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    const sleep = page.getByRole('dialog', { name: t('sheet.sleep.title') });
    await enterDuration(sleep, 60);
    await pickTime(sleep, '2026-09-25T09:00');
    await sleep.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sleep).toBeHidden();

    await openTab(page, t('tab.log'));
    await openRow(page, t('sheet.sleep.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.sleep.title')}`,
    });
    await sheet.getByLabel(t('edit.end'), { exact: true }).fill('2026-09-25T07:30');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t('rule.end-before-start'));
    await expect(sheet).toBeVisible();
    await expect(logRows(page).first()).toContainText('08:00 – 09:00');
  });

  test('a running feed: correct the current side and end it at a chosen time', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'breastfeed').click();
    const feed = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
    await pickTime(feed, '2026-09-25T09:50');
    await feed.getByRole('button', { name: t('side.L.button'), exact: true }).click();
    await expect(feed).toBeHidden();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).first()).toContainText(`09:50 – ${t('log.ongoing')}`);
    await expect(logRows(page).first()).toContainText(
      `${t('side.L.button')} · ${t('log.ongoing')}`,
    );
    await openRow(page, t('sheet.breastfeed.title'));
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.breastfeed.title')}`,
    });
    await sheet
      .getByRole('group', { name: t('edit.segment', { n: 1 }) })
      .getByRole('button', { name: t('side.R.button'), exact: true })
      .click();
    await sheet.getByLabel(t('edit.endOptional')).fill('2026-09-25T09:58');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText('09:50 – 09:58');
    await expect(logRows(page).first()).toContainText(
      `${t('side.R.button')} ${t('time.minutes', { m: 8 })}`,
    );
    await openTab(page, t('tab.home'));
    await expect(
      babyCard(page, 'Ada').getByRole('button', { name: new RegExp(t('timer.stopFeed')) }),
    ).toHaveCount(0);
  });

  test('a running sleep: changes must be saved before waking up, which then stops it', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    await page
      .getByRole('dialog', { name: t('sheet.sleep.title') })
      .getByRole('button', { name: t('sheet.startSleep'), exact: true })
      .click();

    await openTab(page, t('tab.log'));
    await expect(logRows(page).first()).toContainText(new RegExp(`10:0\\d – ${t('log.ongoing')}`));
    await openRow(page, t('sheet.sleep.title'));
    let sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.sleep.title')}`,
    });
    const wakeUp = () => sheet.getByRole('button', { name: t('timer.wakeUp'), exact: true });
    await expect(sheet.getByLabel(t('edit.end'), { exact: true })).toHaveCount(0);
    await expect(wakeUp()).toBeEnabled();
    const start = sheet.getByLabel(t('edit.start'), { exact: true });
    const stored = await start.inputValue();
    // Changed and changed back: the stored time (seconds included) is restored, so nothing is left to save.
    await start.fill('2026-09-25T09:30');
    await expect(wakeUp()).toBeDisabled();
    await start.fill(stored);
    await expect(wakeUp()).toBeEnabled();
    await start.fill('2026-09-25T09:30');
    await expect(wakeUp()).toBeDisabled();
    await expect(sheet.getByText(t('edit.saveFirst'))).toBeVisible();
    await expect(wakeUp()).toHaveAccessibleDescription(t('edit.saveFirst'));
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).toContainText(`09:30 – ${t('log.ongoing')}`);

    await openRow(page, t('sheet.sleep.title'));
    sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.sleep.title')}`,
    });
    await wakeUp().click();
    await expect(sheet).toBeHidden();
    await expect(logRows(page).first()).not.toContainText(t('log.ongoing'));
    await openTab(page, t('tab.home'));
    await expect(babyCard(page, 'Ada')).toContainText(t('tile.awake'));
  });

  test('the "forgot to stop?" hint opens the running entry so it can end at the right time', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await cardAction(page, 'sleep').click();
    await page
      .getByRole('dialog', { name: t('sheet.sleep.title') })
      .getByRole('button', { name: t('sheet.startSleep'), exact: true })
      .click();
    const card = babyCard(page, 'Ada');
    const hint = card.getByRole('button', { name: `Ada: ${t('timer.forgot')}`, exact: true });
    await expect(card).toContainText(asleepHeadline);
    await expect(hint).toHaveCount(0);

    await page.clock.fastForward('13:00:00');
    await expect(hint).toHaveText(t('timer.forgot'));
    await hint.click();
    const sheet = page.getByRole('dialog', {
      name: `${t('edit.title')} · ${t('sheet.sleep.title')}`,
    });
    await sheet.getByLabel(t('edit.endOptional')).fill('2026-09-25T12:30');
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(card).toContainText(formatDuration(t, 10 * HOUR + 30 * MINUTE));
    await expect(card).toContainText(t('tile.awake'));
    await expect(hint).toHaveCount(0);
  });
});
