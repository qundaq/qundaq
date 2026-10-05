import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { formatDuration } from '../src/ui/shared/format';
import { HOUR, MINUTE } from '../src/domain/time';
import {
  addBabyInSettings,
  dayPicker,
  enterDuration,
  logFeedAfterwards,
  logDiaper,
  logRows,
  openOther,
  logPumpAfterwards,
  openPump,
  openRow,
  openTab,
  cardAction,
  pickTime,
  summaryCard,
  summaryTileLines,
  type SummaryTileKey,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T09:00:00+03:00') });
  await page.goto('./');
});

function growthMetric(page: Page, name: string) {
  return page
    .getByRole('group', { name: t('growth.metric'), exact: true })
    .getByRole('button', { name, exact: true });
}

/** A tile reads exactly its label, its value and its diff line; without `diff`, the tile has no diff line. */
async function expectTile(page: Page, key: SummaryTileKey, value: string, diff?: string) {
  await expect(summaryTileLines(page, key)).toHaveText([
    t(`summary.tile.${key}`),
    value,
    ...(diff === undefined ? [] : [diff]),
  ]);
}

async function expectZeroTiles(page: Page) {
  await expectTile(page, 'sleep', formatDuration(t, 0));
  await expectTile(page, 'feeds', '0');
  await expectTile(page, 'bottle', t('unit.ml', { ml: 0 }));
  await expectTile(page, 'diapers', '0');
}

/** Logs a bottle from a card (the first card by default), now or at a picked time. */
async function logBottle(page: Page, ml: number, options: { at?: string; baby?: string } = {}) {
  await cardAction(page, 'bottle', options.baby).click();
  const sheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
  await sheet.getByRole('radio', { name: t('unit.ml', { ml }), exact: true }).click();
  if (options.at) await pickTime(sheet, options.at);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
}

/** Logs a finished sleep of `minutes` that ends now or at a picked time. */
async function logSleep(
  page: Page,
  minutes: number,
  options: { end?: string; baby?: string } = {},
) {
  await cardAction(page, 'sleep', options.baby).click();
  const sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
  await enterDuration(sheet, minutes);
  if (options.end) await pickTime(sheet, options.end);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
}

/** Logs a finished right-side breastfeed of `minutes` that ends now. */
async function logBreastfeed(page: Page, minutes: number) {
  await cardAction(page, 'breastfeed').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
  await logFeedAfterwards(sheet, { right: minutes });
  await expect(sheet).toBeHidden();
}

/** The day strip: a region whose accessible name is every baby's summary.dayStrip.summary, joined by " · ". */
function dayStrip(page: Page, name: string) {
  return page.getByRole('region', { name, exact: true });
}

function stepDay(page: Page, direction: 'previous' | 'next') {
  return dayPicker(page)
    .getByRole('button', { name: t(`day.${direction}`) })
    .click();
}

function plus(kind: 'count' | 'ml' | 'duration', value: string | number) {
  return t(`summary.diff.${kind}`, { sign: '+', value });
}

test("the tiles show the day's totals and their diffs; the day before reads zero; coming back restores them", async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logBottle(page, 90);
  await logSleep(page, 40);
  await logDiaper(page);

  await openTab(page, t('tab.summary'));
  const today = async () => {
    // Nothing was logged the day before, so each diff is the whole of today's value.
    await expectTile(
      page,
      'sleep',
      formatDuration(t, 40 * MINUTE),
      plus('duration', formatDuration(t, 40 * MINUTE)),
    );
    // A bottle counts as a feed too.
    await expectTile(page, 'feeds', '1', plus('count', 1));
    await expectTile(
      page,
      'bottle',
      t('unit.ml', { ml: 90 }),
      plus('ml', t('unit.ml', { ml: 90 })),
    );
    await expectTile(page, 'diapers', '1', plus('count', 1));
  };
  await today();

  // The day before and the one before it are both empty: every tile reads zero, with no diff line.
  await stepDay(page, 'previous');
  await expectZeroTiles(page);

  await stepDay(page, 'next');
  await today();
});

test('a tile diff reads up, down or the same against the day before', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  // Yesterday: an hour of sleep, a 60 ml bottle, one diaper.
  await logSleep(page, 60, { end: '2026-09-24T14:00' });
  await logBottle(page, 60, { at: '2026-09-24T10:00' });
  await logDiaper(page, { at: '2026-09-24T11:00' });
  // Today: no sleep, a 90 ml bottle, two diapers.
  await logBottle(page, 90);
  await logDiaper(page);
  await logDiaper(page);

  await openTab(page, t('tab.summary'));
  await expectTile(
    page,
    'sleep',
    formatDuration(t, 0),
    // a true minus sign (U+2212), as the tile writes it
    t('summary.diff.duration', { sign: '−', value: formatDuration(t, HOUR) }),
  );
  await expectTile(page, 'feeds', '1', t('summary.diff.same.count', { value: '1' }));
  await expectTile(page, 'bottle', t('unit.ml', { ml: 90 }), plus('ml', t('unit.ml', { ml: 30 })));
  await expectTile(page, 'diapers', '2', plus('count', 1));
});

test('a sleep across midnight counts on both days; the week chart has seven bars and fits 320px', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  // Three hours ending at 02:00: one hour yesterday, two today.
  await logSleep(page, 180, { end: '2026-09-25T02:00' });

  await openTab(page, t('tab.summary'));
  await expectTile(
    page,
    'sleep',
    formatDuration(t, 2 * HOUR),
    plus('duration', formatDuration(t, HOUR)),
  );
  const week = summaryCard(page, t('summary.week'));
  const bars = week.getByTestId('week-bar');
  await expect(bars).toHaveCount(7);
  // Oldest first, on a nice ceiling above two hours (10,000,000 ms): today 72%, yesterday 36%, the rest empty.
  await expect(bars.nth(6).locator('div')).toHaveAttribute('style', /height: 72%/);
  await expect(bars.nth(5).locator('div')).toHaveAttribute('style', /height: 36%/);
  await expect(bars.nth(4).locator('div')).toHaveAttribute('style', /height: 0%/);

  await stepDay(page, 'previous');
  await expectTile(
    page,
    'sleep',
    formatDuration(t, HOUR),
    plus('duration', formatDuration(t, HOUR)),
  );

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('the day strip shows sleep and feeds on one timeline per baby, with a now tick only today', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await logSleep(page, 180, { end: '2026-09-25T05:00' }); // 02:00 to 05:00
  await logBottle(page, 90, { at: '2026-09-25T06:00' });

  // The installed clock ticks with real time; pin it back to 09:00 so the now tick sits at exactly
  // 9/24 of the day, however long the steps above took. The summary reads "now" as it opens.
  await page.clock.setFixedTime(new Date('2026-09-25T09:00:00+03:00'));
  await openTab(page, t('tab.summary'));
  const ada = t('summary.dayStrip.summary', {
    name: 'Ada',
    sleep: formatDuration(t, 3 * HOUR),
    feeds: 1,
  });
  let strip = dayStrip(page, ada);
  await expect(strip).toBeVisible();
  await expect(
    strip.getByRole('heading', { name: t('summary.dayStrip.title'), exact: true }),
  ).toBeVisible();
  // A single baby's row carries no name.
  await expect(strip.getByText('Ada', { exact: true })).toHaveCount(0);
  const sleep = strip.getByTestId('strip-sleep');
  await expect(sleep).toHaveCount(1);
  await expect(sleep).toHaveAttribute('style', /left: 8\.33\d*%; width: 12\.5%/);
  const feed = strip.getByTestId('strip-feed');
  await expect(feed).toHaveCount(1);
  await expect(feed).toHaveAttribute('style', /left: 25%/);
  await expect(strip.getByTestId('now-tick')).toHaveCount(1);
  await expect(strip.getByTestId('now-tick')).toHaveAttribute('style', /left: 37\.5%/);
  // Let time run again, from a later minute: a frozen clock would give the next baby the same
  // created instant as Ada, and babies sharing one instant are ordered by their random ids.
  await page.clock.setSystemTime(new Date('2026-09-25T09:01:00+03:00'));
  // With one baby there is nothing to switch between.
  await expect(page.getByRole('radiogroup', { name: t('summary.babySwitcher') })).toHaveCount(0);

  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
  await logSleep(page, 60, { baby: 'Cal' });

  await openTab(page, t('tab.summary'));
  const cal = t('summary.dayStrip.summary', {
    name: 'Cal',
    sleep: formatDuration(t, HOUR),
    feeds: 0,
  });
  // One region holds every baby's row, and its name summarises them all.
  strip = dayStrip(page, `${ada} · ${cal}`);
  await expect(strip).toBeVisible();
  await expect(page.getByRole('region')).toHaveCount(1);
  await expect(strip.getByText('Ada', { exact: true })).toBeVisible();
  await expect(strip.getByText('Cal', { exact: true })).toBeVisible();
  await expect(strip.getByTestId('strip-sleep')).toHaveCount(2);
  await expect(strip.getByTestId('now-tick')).toHaveCount(2);

  // The switcher picks whose tiles show; the strip stays shared.
  const switcher = page.getByRole('radiogroup', { name: t('summary.babySwitcher'), exact: true });
  await expect(switcher.getByRole('radio')).toHaveCount(2);
  await expect(switcher.getByRole('radio', { name: 'Ada' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectTile(
    page,
    'sleep',
    formatDuration(t, 3 * HOUR),
    plus('duration', formatDuration(t, 3 * HOUR)),
  );
  await switcher.getByRole('radio', { name: 'Cal' }).click();
  await expect(switcher.getByRole('radio', { name: 'Cal' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expectTile(
    page,
    'sleep',
    formatDuration(t, HOUR),
    plus('duration', formatDuration(t, HOUR)),
  );
  await expectTile(page, 'feeds', '0');
  await expect(strip).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  // A past day has no "now", and nothing was logged on it.
  await stepDay(page, 'previous');
  const empty = (name: string) =>
    t('summary.dayStrip.summary', { name, sleep: formatDuration(t, 0), feeds: 0 });
  strip = dayStrip(page, `${empty('Ada')} · ${empty('Cal')}`);
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('now-tick')).toHaveCount(0);
  await expect(strip.getByTestId('strip-sleep')).toHaveCount(0);
});

test('the week chart switches between sleep, feeding and pumping: empty on a fresh baby, dual bars on two axes once feeds exist', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.summary'));
  const week = summaryCard(page, t('summary.week'));
  const metric = week.getByRole('radiogroup', { name: t('summary.week.metric'), exact: true });
  await expect(metric.getByRole('radio')).toHaveCount(3);
  const sleepTab = metric.getByRole('radio', { name: t('summary.week.metric.sleep') });
  const feedingTab = metric.getByRole('radio', { name: t('summary.week.metric.feeding') });
  await expect(sleepTab).toHaveAttribute('aria-checked', 'true');
  await expect(week.getByText(t('summary.week.empty'))).toBeVisible();
  await feedingTab.click();
  await expect(feedingTab).toHaveAttribute('aria-checked', 'true');
  await expect(week.getByText(t('summary.week.empty'))).toBeVisible();
  await expect(week.getByTestId('week-dual-bar')).toHaveCount(0);

  await openTab(page, t('tab.home'));
  await logBreastfeed(page, 15);
  await logBottle(page, 90);

  await openTab(page, t('tab.summary'));
  await feedingTab.click();
  await expect(week.getByText(t('summary.week.empty'))).toHaveCount(0);
  const bars = week.getByTestId('week-dual-bar');
  await expect(bars).toHaveCount(7);
  // Minutes on the left (15 on a ceiling of 20), millilitres on the right (90 on a ceiling of 100),
  // top tick first: the ceiling, half of it, zero — the three evenly-spaced tick positions.
  await expect(week.getByTestId('week-axis-left').locator('span')).toHaveText(['20', '10', '0']);
  await expect(week.getByTestId('week-axis-right').locator('span')).toHaveText(['100', '50', '0']);
  const todayBars = bars.nth(6).locator('div');
  await expect(todayBars).toHaveCount(2);
  await expect(todayBars.nth(0)).toHaveAttribute('style', /height: 75%/);
  await expect(todayBars.nth(1)).toHaveAttribute('style', /height: 90%/);
  await expect(bars.nth(5).locator('div').nth(0)).toHaveAttribute('style', /height: 0%/);
  // The bars read as one image whose name lists every day's breastfeed time and bottle ml.
  await expect(week.getByRole('img')).toHaveAccessibleName(
    new RegExp(`${formatDuration(t, 15 * MINUTE)} · ${t('unit.ml', { ml: 90 })}$`),
  );

  // The Feeding choice survives stepping to another day and back (the chart reloads each time).
  await stepDay(page, 'previous');
  await expect(feedingTab).toHaveAttribute('aria-checked', 'true');
  await expect(week.getByText(t('summary.week.empty'))).toBeVisible();
  await stepDay(page, 'next');
  await expect(feedingTab).toHaveAttribute('aria-checked', 'true');
  await expect(week.getByTestId('week-dual-bar')).toHaveCount(7);

  // No sleep this week: the sleep side stays empty.
  await sleepTab.click();
  await expect(week.getByText(t('summary.week.empty'))).toBeVisible();
});

test('growth shows in the chart summary and the measurement table; the metric survives tab switches', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  let sheet = await openOther(page, 'growth');
  await pickTime(sheet, '2026-09-20T10:00');
  await sheet.getByLabel(t('growth.weight')).fill('3,45');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
  sheet = await openOther(page, 'growth');
  await sheet.getByLabel(t('growth.weight')).fill('4,1');
  await sheet.getByLabel(t('growth.head')).fill('36');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.summary'));
  await expect(
    page.getByRole('img', {
      name: t('growth.summary', {
        metric: t('growth.metric.weightG'),
        first: '3,45 kg',
        last: '4,1 kg',
        count: 2,
      }),
    }),
  ).toBeVisible();
  const table = page.getByRole('table', { name: t('growth.table') });
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first()).toContainText('4,1 kg');

  await growthMetric(page, t('growth.metric.headMm')).click();
  await expect(
    page.getByRole('img', {
      name: t('growth.summaryOne', { metric: t('growth.metric.headMm'), value: '36 cm' }),
    }),
  ).toBeVisible();
  await growthMetric(page, t('growth.metric.heightMm')).click();
  await expect(page.getByText(t('growth.empty'))).toBeVisible();
  await openTab(page, t('tab.home'));
  await openTab(page, t('tab.summary'));
  await expect(growthMetric(page, t('growth.metric.heightMm'))).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('every record type shows up in the log and the summary, without CSP violations', async ({
  page,
}) => {
  test.slow(); // nine sheets in sequence: 12–26 s, close to the default 30 s timeout.
  // The rows (React style dots), the edit sheet, the day strip, the week bars and the SVG chart must all stay inside the CSP.
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

  await logBreastfeed(page, 15);
  await logBottle(page, 90);
  await logSleep(page, 60);

  await cardAction(page, 'diaper').click();
  let sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'medication');
  await sheet.getByLabel(t('medication.name')).fill('Vitamin D');
  await sheet.getByLabel(t('medication.dose')).fill('400 IU');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'growth');
  await sheet.getByLabel(t('growth.weight')).fill('3,45');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'temperature');
  await sheet.getByLabel(t('temperature.value')).fill('37,2');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  sheet = await openPump(page);
  await logPumpAfterwards(sheet, { mlLeft: 60 });
  await expect(sheet).toBeHidden();

  sheet = await openOther(page, 'healthNote');
  await sheet.getByLabel(t('note.required'), { exact: true }).fill('Vaccine given');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  await expect(logRows(page)).toHaveCount(9);
  for (const text of [
    `${t('side.R.button')} ${t('time.minutes', { m: 15 })}`,
    `${t('unit.ml', { ml: 90 })} · ${t('bottle.breastmilk')}`,
    formatDuration(t, HOUR),
    t('diaper.wet.button'),
    'Vitamin D · 400 IU',
    '3,45 kg',
    `37,2 °C`,
    `${t('side.L.button')} ${t('unit.ml', { ml: 60 })}`,
    'Vaccine given',
  ]) {
    await expect(logRows(page).filter({ hasText: text }), text).toHaveCount(1);
  }
  await openRow(page, t('sheet.bottle.title'));
  const edit = page.getByRole('dialog', {
    name: `${t('edit.title')} · ${t('sheet.bottle.title')}`,
  });
  await edit.getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await expect(edit).toBeHidden();

  await openTab(page, t('tab.summary'));
  await expectTile(
    page,
    'sleep',
    formatDuration(t, HOUR),
    plus('duration', formatDuration(t, HOUR)),
  );
  // The breastfeed and the bottle.
  await expectTile(page, 'feeds', '2', plus('count', 2));
  await expectTile(page, 'bottle', t('unit.ml', { ml: 90 }), plus('ml', t('unit.ml', { ml: 90 })));
  await expectTile(page, 'diapers', '1', plus('count', 1));
  await expect(page.getByTestId('summary-pump')).toContainText(t('pump.report.total', { ml: 60 }));
  // Every inline-styled piece of the dashboard is on screen for the CSP check.
  const strip = dayStrip(
    page,
    t('summary.dayStrip.summary', { name: 'Ada', sleep: formatDuration(t, HOUR), feeds: 2 }),
  );
  await expect(strip.getByTestId('strip-sleep')).toHaveCount(1);
  await expect(strip.getByTestId('strip-feed')).toHaveCount(2);
  await expect(strip.getByTestId('now-tick')).toHaveCount(1);
  const week = summaryCard(page, t('summary.week'));
  await expect(week.getByTestId('week-bar')).toHaveCount(7);
  await week.getByRole('radio', { name: t('summary.week.metric.feeding') }).click();
  await expect(week.getByTestId('week-dual-bar')).toHaveCount(7);
  await expect(
    page.getByRole('img', {
      name: t('growth.summaryOne', { metric: t('growth.metric.weightG'), value: '3,45 kg' }),
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
  ).toEqual([]);
});

test('without babies the summary tab only asks for one', async ({ page }) => {
  await openTab(page, t('tab.summary'));
  await expect(page.getByText(t('summary.noBabies'))).toBeVisible();
  // No dashboard renders: no tiles, no day strip, no week chart.
  await expect(page.locator('[data-testid^="summary-tile-"]')).toHaveCount(0);
  await expect(page.getByRole('region')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: t('summary.week.metric') })).toHaveCount(0);
});

for (const width of [320, 414]) {
  test(`the feeding chart keeps a 4-digit ml axis label inside the card at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await addBabyInSettings(page, 'Ada');
    await openTab(page, t('tab.home'));
    for (let i = 0; i < 6; i += 1) await logBottle(page, 180);
    await openTab(page, t('tab.summary'));
    const week = summaryCard(page, t('summary.week'));
    await week
      .getByRole('radiogroup', { name: t('summary.week.metric'), exact: true })
      .getByRole('radio', { name: t('summary.week.metric.feeding') })
      .click();
    const labels = week.getByTestId('week-axis-right').locator('span');
    await expect(labels.first()).toHaveText(/^\d{4}$/);
    const card = await week.boundingBox();
    const axis = await week.getByTestId('week-axis-right').boundingBox();
    const text = await labels.first().evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(text.right).toBeLessThanOrEqual(axis!.x + axis!.width + 0.5);
    expect(text.right).toBeLessThanOrEqual(card!.x + card!.width);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the pumping card and the Pumping chart follow the seven days, whichever baby is picked', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.summary'));
  await expect(page.getByTestId('summary-pump')).toHaveCount(0);

  await openTab(page, t('tab.home'));
  const logPump = async (end: string, mlLeft: number, mlRight?: number) => {
    const sheet = await openPump(page);
    await logPumpAfterwards(sheet, { mlLeft, mlRight, end });
    await expect(sheet).toBeHidden();
  };
  await logPump('2026-09-22T09:00', 80, 60);
  await logPump('2026-09-25T08:00', 70);

  await openTab(page, t('tab.summary'));
  const card = page.getByTestId('summary-pump');
  await expect(card).toContainText(t('pump.report.sessions.one'));
  await expect(card).toContainText(t('pump.report.total', { ml: 70 }));
  await expect(card).toContainText(t('pump.report.sides', { l: 70, r: 0 }));
  await expect(card).toContainText(t('pump.report.week', { ml: 210 }));
  await expect(card).toContainText(t('pump.report.average', { ml: 30 }));

  const week = summaryCard(page, t('summary.week'));
  await expect(week.getByRole('radio')).toHaveCount(3);
  await week.getByRole('radio', { name: t('summary.week.metric.pump') }).click();
  const bars = week.getByTestId('week-pump-bar');
  await expect(bars).toHaveCount(7);
  await expect(week.getByTestId('week-axis-left').locator('span')).toHaveText(['200', '100', '0']);
  await expect(bars.nth(6).locator('div')).toHaveAttribute('style', /height: 35%/);
  await expect(bars.nth(3).locator('div')).toHaveAttribute('style', /height: 70%/);
  await expect(bars.nth(4).locator('div')).toHaveAttribute('style', /height: 0%/);

  // Pumps belong to no baby: the other baby sees the same chart and card.
  await page.getByRole('radio', { name: 'Cal', exact: true }).click();
  await expect(card).toContainText(t('pump.report.week', { ml: 210 }));
  await expect(bars).toHaveCount(7);
  await expect(week.getByRole('radio', { name: t('summary.week.metric.pump') })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // A day with no pump keeps the 7-day lines; Sleep and Feeding are untouched.
  await stepDay(page, 'previous');
  await expect(card).not.toContainText(t('pump.report.sessions.one'));
  await expect(card).toContainText(t('pump.report.week', { ml: 140 }));
  await expect(card).toContainText(t('pump.report.average', { ml: 20 }));
  await week.getByRole('radio', { name: t('summary.week.metric.sleep') }).click();
  await expect(week.getByText(t('summary.week.empty'))).toBeVisible();
});
