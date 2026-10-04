import { expect, test } from '@playwright/test';
import { t } from './support/i18n';
import { HOUR, MINUTE } from '../src/domain/time';
import { formatDuration } from '../src/ui/shared/format';
import {
  addBabyInSettings,
  babyCard,
  enterDuration,
  feedTile,
  filterGroup,
  logDiaper,
  logRows,
  openPump,
  openRangeSheet,
  openRow,
  openTab,
  rangeLabel,
  rangePicker,
  cardAction,
  pickTime,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T10:00:00+03:00') });
  await page.goto('./');
});

const shortDayAndMonth = (day: number) =>
  new Intl.DateTimeFormat('tr', { day: 'numeric', month: 'short' }).format(
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
    await expect(rangeLabel(page)).toHaveText(t('range.today'));
    await expect(rangePicker(page).getByRole('button', { name: t('day.next') })).toBeDisabled();
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
    await expect(await filterGroup(page, 'baby')).toHaveCount(0);
  });

  test('one hour heading per hour, in newest-first order, even when a third entry shares an hour', async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { at: '2026-09-25T08:15' });
    await logDiaper(page, { at: '2026-09-25T09:05' });
    await logDiaper(page, { at: '2026-09-25T09:45' }); // shares 09:xx with the previous entry

    await openTab(page, t('tab.log'));
    const headings = page.getByRole('heading', { level: 3 });
    await expect(headings).toHaveCount(2);
    // Newest first: 09:00 (covering both 09:05 and 09:45) before 08:00.
    await expect(headings.nth(0)).toHaveText('09:00');
    await expect(headings.nth(1)).toHaveText('08:00');
  });

  test('previous and next day, a picked day, and never the old day under the new heading', async ({
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
        const day = document.querySelector('[data-testid="range-current"]')?.textContent ?? '';
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
    await rangePicker(page)
      .getByRole('button', { name: t('day.previous') })
      .click();
    await expect(rangeLabel(page)).toHaveText(t('day.yesterday'));
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

    await rangePicker(page)
      .getByRole('button', { name: t('day.next') })
      .click();
    await expect(rangeLabel(page)).toHaveText(t('range.today'));

    const sheet = await openRangeSheet(page);
    await sheet.getByLabel(t('range.from')).fill('2026-09-20');
    await sheet.getByLabel(t('range.to')).fill('2026-09-20');
    await expect(rangeLabel(page)).toHaveText(shortDayAndMonth(20));
    await expect(page.getByText(t('log.empty'))).toBeVisible();
    await sheet.getByRole('button', { name: t('range.today'), exact: true }).click();
    await expect(rangeLabel(page)).toHaveText(t('range.today'));
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
    await (
      await filterGroup(page, 'baby')
    )
      .getByRole('button', { name: 'Ada', exact: true })
      .click();
    await expect(logRows(page)).toHaveCount(2);
    await (
      await filterGroup(page, 'type')
    )
      .getByRole('button', { name: t('log.type.diaper'), exact: true })
      .click();
    await expect(logRows(page)).toHaveCount(1);
    await (
      await filterGroup(page, 'type')
    )
      .getByRole('button', { name: t('log.type.sleep'), exact: true })
      .click();
    await expect(page.getByText(t('log.emptyFiltered'))).toBeVisible();
    // The filter sheet is still open (live filtering, no auto-close); it must close before the tab switch.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: t('log.filter.trigger') })).toBeHidden();

    await openTab(page, t('tab.home'));
    await openTab(page, t('tab.log'));
    await expect(
      (await filterGroup(page, 'baby')).getByRole('button', { name: 'Ada', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      (await filterGroup(page, 'type')).getByRole('button', {
        name: t('log.type.sleep'),
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await (
      await filterGroup(page, 'baby')
    )
      .getByRole('button', { name: t('sheet.all'), exact: true })
      .click();
    await (
      await filterGroup(page, 'type')
    )
      .getByRole('button', { name: t('sheet.all'), exact: true })
      .click();
    await expect(logRows(page)).toHaveCount(3);
  });

  test('the filter trigger row summarizes the active baby and type filters', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await addBabyInSettings(page, 'Cal');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { baby: 'Ada' });
    await logDiaper(page, { baby: 'Cal' });

    await openTab(page, t('tab.log'));
    const trigger = page.getByRole('button', { name: t('log.filter.trigger') });
    await expect(trigger).toContainText(t('sheet.all'));

    await (
      await filterGroup(page, 'baby')
    )
      .getByRole('button', { name: 'Ada', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: t('log.filter.trigger') })).toBeHidden();
    await expect(trigger).toContainText('Ada');
    await expect(trigger).not.toContainText(t('sheet.all'));

    await (
      await filterGroup(page, 'type')
    )
      .getByRole('button', { name: t('log.type.diaper'), exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(trigger).toContainText(`Ada · ${t('log.type.diaper')}`);
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
    await rangePicker(page)
      .getByRole('button', { name: t('day.previous') })
      .click();
    await expect(logRows(page).first()).toContainText(`22:10 – 06:30 ${t('log.suffix.nextDay')}`);
  });

  test("the brand row's range picker fits at 320, 360 and 414 px, for one day and for longer ranges", async ({
    page,
  }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.log'));
    const picker = rangePicker(page);
    const label = rangeLabel(page);
    const check = async () => {
      for (const width of [320, 360, 414]) {
        await page.setViewportSize({ width, height: 800 });
        for (const button of await picker.getByRole('button').all()) {
          const box = await button.boundingBox();
          expect(box!.width, `range button at ${width}px`).toBeGreaterThanOrEqual(48);
          expect(box!.height, `range button at ${width}px`).toBeGreaterThanOrEqual(48);
        }
        expect(
          await label.evaluate((el) => {
            const text = el.firstElementChild!;
            return text.scrollWidth <= text.clientWidth;
          }),
          `range label clipped at ${width}px`,
        ).toBe(true);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `page overflow at ${width}px`,
        ).toBe(true);
      }
    };
    await expect(label).toHaveText(t('range.today'));
    await check();

    const sheet = await openRangeSheet(page);
    await sheet.getByLabel(t('range.from')).fill('2026-09-20');
    await sheet.getByLabel(t('range.to')).fill('2026-09-20');
    await expect(label).toHaveText(shortDayAndMonth(20));
    await page.keyboard.press('Escape');
    await check();

    await openRangeSheet(page);
    await sheet.getByRole('button', { name: t('range.last30'), exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(label).toHaveText(t('range.last30'));
    await check();

    await openRangeSheet(page);
    await sheet.getByLabel(t('range.from')).fill('2026-09-12');
    await sheet.getByLabel(t('range.to')).fill('2026-09-20');
    await page.keyboard.press('Escape');
    await expect(label).toHaveText(`${shortDayAndMonth(12)} – ${shortDayAndMonth(20)}`);
    await check();

    // The range sheet's two date fields sit side by side inside the sheet, even at 320 px.
    await page.setViewportSize({ width: 320, height: 800 });
    await openRangeSheet(page);
    const sheetBox = await sheet.boundingBox();
    for (const field of [t('range.from'), t('range.to')]) {
      const box = await sheet.getByLabel(field).boundingBox();
      expect(box!.x + box!.width, `${field} field at 320px`).toBeLessThanOrEqual(
        sheetBox!.x + sheetBox!.width,
      );
      expect(box!.height, `${field} field at 320px`).toBeGreaterThanOrEqual(48);
    }
  });

  test('quick ranges, a custom range, day headings, and the one-day steps', async ({ page }) => {
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    await logDiaper(page, { at: '2026-09-23T08:00' });
    await logDiaper(page, { at: '2026-09-24T21:00' });
    await logDiaper(page, { at: '2026-09-25T09:00' });
    await openTab(page, t('tab.log'));
    const picker = rangePicker(page);
    const label = rangeLabel(page);
    const dayHeadings = page.getByRole('list', { name: t('log.list') }).getByRole('heading', {
      level: 3,
    });
    const hourHeadings = page.getByRole('list', { name: t('log.list') }).getByRole('heading', {
      level: 4,
    });

    // Today: one row, hour headings only.
    await expect(label).toHaveText(t('range.today'));
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('09:00');
    await expect(hourHeadings).toHaveCount(0);

    const sheet = await openRangeSheet(page);
    const chip = (key: 'range.today' | 'range.yesterday' | 'range.last7' | 'range.last30') =>
      sheet.getByRole('button', { name: t(key), exact: true });
    await expect(chip('range.today')).toHaveAttribute('aria-pressed', 'true');
    await chip('range.yesterday').click();
    await expect(label).toHaveText(t('range.yesterday'));
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('21:00');

    // Last 7 days: all three days, newest first, each under its own day heading.
    await chip('range.last7').click();
    await expect(label).toHaveText(t('range.last7'));
    await expect(chip('range.last7')).toHaveAttribute('aria-pressed', 'true');
    await expect(logRows(page)).toHaveCount(3);
    const wednesday = new Intl.DateTimeFormat('tr', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(2026, 8, 23));
    await expect(dayHeadings).toHaveText([t('day.today'), t('day.yesterday'), wednesday]);
    await expect(hourHeadings).toHaveText(['09:00', '21:00', '08:00']);
    await expect(sheet.getByLabel(t('range.from'))).toHaveValue('2026-09-19');
    await expect(sheet.getByLabel(t('range.to'))).toHaveValue('2026-09-25');

    // A custom range: the label shows its first and last day, and no quick range is lit.
    await sheet.getByLabel(t('range.from')).fill('2026-09-23');
    await sheet.getByLabel(t('range.to')).fill('2026-09-24');
    await expect(label).toHaveText(`${shortDayAndMonth(23)} – ${shortDayAndMonth(24)}`);
    await expect(chip('range.last7')).toHaveAttribute('aria-pressed', 'false');
    await expect(logRows(page)).toHaveCount(2);
    await expect(dayHeadings).toHaveText([t('day.yesterday'), wednesday]);
    // A longer range has no day steps.
    await expect(picker.getByRole('button', { name: t('day.previous') })).toHaveCount(0);

    // A one-day custom range steps by a day again.
    await sheet.getByLabel(t('range.from')).fill('2026-09-24');
    await expect(label).toHaveText(t('day.yesterday'));
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // One day again: no day heading, and the hour headings are back at level 3.
    await expect(dayHeadings).toHaveText(['21:00']);
    await expect(hourHeadings).toHaveCount(0);
    await picker.getByRole('button', { name: t('day.previous') }).click();
    await expect(label).toHaveText(shortDayAndMonth(23));
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText('08:00');
    await picker.getByRole('button', { name: t('day.next') }).click();
    await picker.getByRole('button', { name: t('day.next') }).click();
    await expect(label).toHaveText(t('range.today'));
    await expect(picker.getByRole('button', { name: t('day.next') })).toBeDisabled();

    // A range with nothing in it.
    await openRangeSheet(page);
    await sheet.getByLabel(t('range.from')).fill('2026-09-10');
    await sheet.getByLabel(t('range.to')).fill('2026-09-20');
    await expect(page.getByText(t('log.empty'))).toBeVisible();
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

test('the pumping filter reports the range: sessions, total, sides and the daily average', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
  const logPump = async (at: string, left: string, right?: string) => {
    const sheet = await openPump(page);
    await pickTime(sheet, at);
    await sheet.getByLabel(t('pump.left')).fill(left);
    if (right) await sheet.getByLabel(t('pump.right')).fill(right);
    await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
    await expect(sheet).toBeHidden();
  };
  await logPump('2026-09-24T09:00', '80', '60');
  await logPump('2026-09-25T08:00', '70');

  await openTab(page, t('tab.log'));
  const sheet = await openRangeSheet(page);
  await sheet.getByRole('button', { name: t('range.last7'), exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pump-report')).toHaveCount(0);

  await (
    await filterGroup(page, 'type')
  )
    .getByRole('button', { name: t('log.type.pump'), exact: true })
    .click();
  const report = page.getByTestId('pump-report');
  await expect(report).toContainText(t('pump.report.title'));
  await expect(report).toContainText(t('pump.report.sessions', { n: 2 }));
  await expect(report).toContainText(t('pump.report.total', { ml: 210 }));
  await expect(report).toContainText(t('pump.report.sides', { l: 150, r: 60 }));
  await expect(report).toContainText(t('pump.report.average', { ml: 30 }));
  await expect(logRows(page)).toHaveCount(2);

  // Pumps belong to no baby: one baby's filter leaves the empty text and no report.
  await (await filterGroup(page, 'baby')).getByRole('button', { name: 'Ada', exact: true }).click();
  await expect(page.getByText(t('log.emptyFiltered'))).toBeVisible();
  await expect(report).toHaveCount(0);
});
