import { expect, test } from '@playwright/test';
import { escapeRegExp, t } from './support/i18n';
import {
  addBabyInSettings,
  filterGroup,
  logRows,
  openOther,
  openTab,
  cardAction,
  pickTime,
} from './support/tracking';

test.use({ timezoneId: 'Europe/Istanbul' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T10:00:00+03:00') });
  await page.goto('./');
});

test('the list shows every type with its caption; the back button returns to it and resets the form', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  await cardAction(page, 'other').click();
  const sheet = page.getByRole('dialog');
  await expect(page.getByRole('dialog', { name: t('other.title') })).toBeVisible();
  // Five rows, plus the header's close button (no back button on the list step itself).
  await expect(sheet.getByRole('button')).toHaveCount(6);
  await expect(sheet.getByRole('button', { name: t('other.chip.growth') })).toContainText(
    t('other.caption.growth'),
  );
  await expect(sheet.getByRole('button', { name: t('other.chip.pump') })).toContainText(
    t('other.caption.pump'),
  );

  await sheet.getByRole('button', { name: t('other.chip.temperature') }).click();
  await expect(page.getByRole('dialog', { name: t('sheet.temperature.title') })).toBeVisible();
  await sheet.getByLabel(t('temperature.value')).fill('37,5');

  await sheet.getByRole('button', { name: t('common.back') }).click();
  await expect(page.getByRole('dialog', { name: t('other.title') })).toBeVisible();
  await sheet.getByRole('button', { name: t('other.chip.temperature') }).click();
  await expect(page.getByRole('dialog', { name: t('sheet.temperature.title') })).toBeVisible();
  await expect(sheet.getByLabel(t('temperature.value'))).toHaveValue('');
});

test('a medicine is logged for that baby, and offered again with its dose', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  let sheet = await openOther(page, 'medication');
  await expect(page.getByRole('dialog', { name: t('sheet.medication.title') })).toBeVisible();
  await sheet.getByLabel(t('medication.name')).fill('Vitamin D');
  await sheet.getByLabel(t('medication.dose')).fill('400 IU');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  await expect(logRows(page)).toHaveCount(1);
  await expect(logRows(page).filter({ hasText: 'Vitamin D · 400 IU' })).toHaveCount(1);

  await openTab(page, t('tab.home'));
  sheet = await openOther(page, 'medication');
  await sheet
    .getByRole('group', { name: t('medication.recent') })
    .getByRole('button', { name: 'Vitamin D', exact: true })
    .click();
  await expect(sheet.getByLabel(t('medication.name'))).toHaveValue('Vitamin D');
  await expect(sheet.getByLabel(t('medication.dose'))).toHaveValue('400 IU');
});

test('weight and height for one baby, typed with a comma', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'growth', 'Cal');
  await expect(
    page.getByRole('dialog', {
      name: new RegExp(`${escapeRegExp(t('sheet.growth.title'))} · Cal$`),
    }),
  ).toBeVisible();
  await sheet.getByLabel(t('growth.weight')).fill('3,45');
  await sheet.getByLabel(t('growth.height')).fill('52,5');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  const row = logRows(page).filter({ hasText: t('sheet.growth.title') });
  await expect(row).toContainText('Cal');
  await expect(row).toContainText(`3,45 kg · ${t('describe.height', { value: '52,5' })}`);
  await filterGroup(page, 'baby').getByRole('button', { name: 'Ada', exact: true }).click();
  await expect(page.getByText(t('log.emptyFiltered'))).toBeVisible();
});

test('a weight typed in grams asks for kilograms', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'growth');
  await sheet.getByLabel(t('growth.weight')).fill('3450');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(t('rule.weight-in-kg'));
});

test('a temperature of 38 °C or more shows the fever hint and marks the row', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'temperature');
  await sheet.getByLabel(t('temperature.value')).fill('38,2');
  await expect(sheet.getByText(t('temperature.alert.fever'))).toBeVisible();
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  const row = logRows(page).filter({ hasText: t('describe.temperature', { value: '38,2' }) });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button')).toHaveAccessibleName(new RegExp(t('log.warning')));
});

test('pumping has no baby and shows under "all babies" only', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await addBabyInSettings(page, 'Cal');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'pump');
  await expect(sheet.getByRole('group', { name: t('sheet.babies'), exact: true })).toHaveCount(0);
  await sheet.getByLabel(t('pump.left')).fill('60');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  const row = logRows(page).filter({ hasText: t('sheet.pump.title') });
  await expect(row).toContainText(t('log.mother'));
  await expect(row).toContainText(`${t('side.L.button')} ${t('unit.ml', { ml: 60 })}`);
  await filterGroup(page, 'baby').getByRole('button', { name: 'Ada', exact: true }).click();
  await expect(page.getByText(t('log.emptyFiltered'))).toBeVisible();
});

test('a health note needs text and is shown from the start', async ({ page }) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'healthNote');
  await expect(page.getByRole('dialog', { name: t('sheet.healthNote.title') })).toBeVisible();
  await expect(sheet.getByRole('button', { name: t('note.add') })).toHaveCount(0);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText(t('rule.note-required'));
  await expect(sheet.getByLabel(t('note.required'), { exact: true })).toHaveAttribute(
    'aria-required',
    'true',
  );

  await pickTime(sheet, '2026-09-25T09:15');
  await sheet.getByLabel(t('note.required'), { exact: true }).fill('Vaccine day, cranky');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  const row = logRows(page).filter({ hasText: t('sheet.healthNote.title') });
  await expect(row).toContainText('09:15');
  await expect(row).toContainText('Vaccine day, cranky');
});

test("another entry's note is added only when the note button is tapped, and is focused once shown", async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  await openTab(page, t('tab.home'));
  const sheet = await openOther(page, 'medication');
  await expect(sheet.getByLabel(t('note.optional'))).toHaveCount(0);
  await sheet.getByRole('button', { name: t('note.add'), exact: true }).click();
  const note = sheet.getByLabel(t('note.optional'));
  await expect(note).toBeFocused();
  await note.fill('Given with food');
  await sheet.getByLabel(t('medication.name')).fill('Vitamin D');
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();

  await openTab(page, t('tab.log'));
  const row = logRows(page).filter({ hasText: 'Vitamin D' });
  await expect(row).toContainText('Given with food');
});

test('the five card actions fit at 320, 360 and 414 px, in Turkish and English', async ({
  page,
}) => {
  await addBabyInSettings(page, 'Ada');
  const check = async (groupName: string) => {
    const buttons = page.getByRole('group', { name: groupName, exact: true }).getByRole('button');
    for (const width of [320, 360, 414]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(buttons).toHaveCount(5);
      for (const button of await buttons.all()) {
        const box = await button.boundingBox();
        expect(box!.width, `${groupName} at ${width}px`).toBeGreaterThanOrEqual(48);
        expect(box!.height, `${groupName} at ${width}px`).toBeGreaterThanOrEqual(56);
        expect(
          await button.evaluate((el) => el.scrollWidth <= el.clientWidth),
          `text clipped at ${width}px`,
        ).toBe(true);
        // overflow-wrap would hide a mid-word break from the check above: each label must be one line.
        // The icon sits above the label as its own element, so measure the label span, not the button.
        const lines = await button.evaluate((el) => {
          const label = el.querySelector('span:last-child') ?? el;
          const range = document.createRange();
          range.selectNodeContents(label);
          return range.getClientRects().length;
        });
        expect(lines, `label wraps at ${width}px`).toBe(1);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `page overflow at ${width}px`,
      ).toBe(true);
    }
  };
  await openTab(page, t('tab.home'));
  await check(t('card.actions', { name: 'Ada' }));
  await openTab(page, t('tab.settings'));
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Home', exact: true })
    .click();
  await check('Ada: log');
});
