import { expect, test, type Page } from '@playwright/test';
import { t } from './support/i18n';
import { formatDuration } from '../src/ui/shared/format';
import { HOUR } from '../src/domain/time';
import {
  addBabyInSettings,
  dayPicker,
  enterDuration,
  logRows,
  openOther,
  openRow,
  openTab,
  cardAction,
  pickTime,
  summaryValue,
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

test('a sleep across midnight counts on both days; the week table has seven rows and fits 320px', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await cardAction(page, 'sleep').click();
  const sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
  await enterDuration(sheet, 180);
  await pickTime(sheet, '2026-09-25T02:00');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.summary'));
  await expect(
    page.getByRole('heading', {
      name: t('summary.dayTitle', { name: 'Ada', day: t('day.today') }),
    }),
  ).toBeVisible();
  // the sleep began yesterday: no count today, so the cell shows only the duration
  await expect(summaryValue(page, t('summary.sleep'))).toHaveText(formatDuration(t, 2 * HOUR));
  const week = page.getByRole('table', { name: t('summary.week') });
  await expect(week.locator('tbody tr')).toHaveCount(7);
  await expect(week.locator('tbody tr').nth(0)).toContainText(formatDuration(t, 2 * HOUR));
  await expect(week.locator('tbody tr').nth(1)).toContainText(formatDuration(t, 1 * HOUR));

  await dayPicker(page)
    .getByRole('button', { name: t('day.previous') })
    .click();
  await expect(
    page.getByRole('heading', {
      name: t('summary.dayTitle', { name: 'Ada', day: t('day.yesterday') }),
    }),
  ).toBeVisible();
  await expect(summaryValue(page, t('summary.sleep'))).toHaveText(
    t('summary.sleepValue', { duration: formatDuration(t, 1 * HOUR), count: 1 }),
  );

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
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
  // The rows (React style dots), the edit sheet and the SVG chart must all stay inside the CSP.
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

  await cardAction(page, 'breastfeed').click();
  let sheet = page.getByRole('dialog', { name: t('sheet.breastfeed.title') });
  await enterDuration(sheet, 15);
  await sheet.getByRole('radio', { name: t('side.R.button'), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await cardAction(page, 'bottle').click();
  sheet = page.getByRole('dialog', { name: t('sheet.bottle.title') });
  await sheet.getByRole('radio', { name: t('unit.ml', { ml: 90 }), exact: true }).click();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await cardAction(page, 'sleep').click();
  sheet = page.getByRole('dialog', { name: t('sheet.sleep.title') });
  await enterDuration(sheet, 60);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await cardAction(page, 'diaper').click();
  sheet = page.getByRole('dialog', { name: t('sheet.diaper.title') });
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

  sheet = await openOther(page, 'pump');
  await sheet.getByLabel(t('pump.left')).fill('60');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
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
  await expect(summaryValue(page, t('summary.feeds'))).toHaveText('2');
  await expect(summaryValue(page, t('summary.breast'))).toHaveText(
    t('summary.breastValue', {
      total: t('time.minutes', { m: 15 }),
      sides: t('summary.breastSide.R', { duration: t('time.minutes', { m: 15 }) }),
    }),
  );
  await expect(summaryValue(page, t('summary.bottle'))).toHaveText(
    t('summary.bottleValue', { count: 1, ml: 90 }),
  );
  await expect(summaryValue(page, t('summary.sleep'))).toHaveText(
    t('summary.sleepValue', { duration: formatDuration(t, HOUR), count: 1 }),
  );
  await expect(summaryValue(page, t('summary.diapers'))).toHaveText(
    t('summary.diaperValue', { wet: 1, dirty: 0, total: 1 }),
  );
  await expect(page.getByTestId('summary-pump')).toContainText(t('summary.pumpTotal', { ml: 60 }));
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
  await expect(page.getByRole('table')).toHaveCount(0);
});
