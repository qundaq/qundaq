import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegExp, t } from './i18n';

export async function openTab(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: t('nav.label') })
    .getByRole('button', { name, exact: true })
    .click();
}

export async function addBabyInSettings(page: Page, name: string) {
  await openTab(page, t('tab.settings'));
  await page.getByRole('button', { name: t('babies.add'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: t('babies.formTitle.add') });
  await dialog.getByLabel(t('babies.name')).fill(name);
  await dialog.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();
}

/**
 * Deletes a baby from Settings: opens its edit dialog and taps the two-step delete button there
 * (edit.deleteConfirm's pattern - `babies.delete`, then `babies.deleteConfirm`). Clearing the confirm
 * window's 600 ms minimum needs `page.clock.fastForward` on a page whose clock is faked (a real wait
 * would not move its frozen `Date.now()`), or a real wait otherwise.
 */
export async function deleteBabyInSettings(
  page: Page,
  name: string,
  options: { fakeClock?: boolean } = {},
) {
  const row = page.getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: t('babies.edit') }).click();
  const dialog = page.getByRole('dialog', { name: t('babies.formTitle.edit') });
  const remove = dialog.getByRole('button', {
    name: new RegExp(
      `^(${escapeRegExp(t('babies.delete'))}|${escapeRegExp(t('babies.deleteConfirm'))})$`,
    ),
  });
  await remove.click();
  await expect(remove).toHaveText(t('babies.deleteConfirm'));
  if (options.fakeClock) await page.clock.fastForward(700);
  else await page.waitForTimeout(700);
  await remove.click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
}

export function babyCard(page: Page, name: string) {
  return page.getByRole('article', { name });
}

export type CardActionKind = 'breastfeed' | 'bottle' | 'sleep' | 'diaper' | 'other';

/** A baby card's action button; without `baby`, the first card's (the only card in single-baby specs). */
export function cardAction(page: Page, kind: CardActionKind, baby?: string) {
  const card = baby ? babyCard(page, baby) : page.getByRole('article').first();
  return card.getByRole('button', { name: new RegExp(`: ${t(`quick.${kind}`)}$`) });
}

/** The rows of the log (history) list. */
export function logRows(page: Page) {
  return page.getByRole('list', { name: t('log.list'), exact: true }).getByRole('listitem');
}

/** Opens the edit sheet of the first log row that contains `text`. */
export async function openRow(page: Page, text: string) {
  await logRows(page).filter({ hasText: text }).first().getByRole('button').click();
}

/** The summary tab's day picker. */
export function dayPicker(page: Page) {
  return page.getByRole('group', { name: t('day.label'), exact: true });
}

/** The log (history) tab's date range in the brand row: the label button, and ‹ › for a one-day range. */
export function rangePicker(page: Page) {
  return page.getByRole('group', { name: t('range.title'), exact: true });
}

/** The log tab's range label (the button that opens the range sheet): its text is the label alone. */
export function rangeLabel(page: Page) {
  return page.getByTestId('range-current');
}

/** Opens the log tab's range sheet, unless it is already open. */
export async function openRangeSheet(page: Page) {
  const sheet = page.getByRole('dialog', { name: t('range.title') });
  if (!(await sheet.isVisible())) await rangeLabel(page).click();
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Opens the log (history) tab's filter sheet, unless it is already open. */
export async function openFilterSheet(page: Page) {
  const sheet = page.getByRole('dialog', { name: t('log.filter.trigger') });
  if (!(await sheet.isVisible())) {
    await page.getByRole('button', { name: t('log.filter.trigger') }).click();
  }
  return sheet;
}

/** The baby or type fieldset inside the log tab's filter sheet, opening the sheet first if needed. */
export async function filterGroup(page: Page, kind: 'baby' | 'type') {
  const sheet = await openFilterSheet(page);
  return sheet.getByRole('group', { name: t(`log.filter.${kind}`), exact: true });
}

/** Chooses "Pick a time…" in a log sheet and types a date and time ("2026-09-25T09:40"). */
export async function pickTime(sheet: Locator, at: string) {
  await sheet.getByRole('radio', { name: t('time.pick') }).click();
  await sheet.getByLabel(t('time.picked')).fill(at);
}

/** Switches a sleep sheet to its "finished" mode (sheet.mode.doneSleep) and enters a duration in minutes. */
export async function enterDuration(sheet: Locator, minutes: number) {
  await sheet.getByRole('radio', { name: t('sheet.mode.doneSleep'), exact: true }).click();
  const hours = new Intl.NumberFormat('tr', { maximumFractionDigits: 1 }).format(minutes / 60);
  const name =
    minutes < 60 ? t('duration.minutes', { m: minutes }) : t('duration.hours', { h: hours });
  const chip = sheet.getByRole('radio', { name, exact: true });
  if ((await chip.count()) > 0) await chip.click();
  else {
    await sheet.getByRole('radio', { name: t('sheet.durationOther'), exact: true }).click();
    await sheet.getByLabel(t('sheet.durationMinutes')).fill(String(minutes));
  }
}

/**
 * One set of time chips in a sheet with two (the feed sheet's start and end), found by its label, with
 * its picked date-and-time field: pass it to pickTime or look its chips up in it.
 */
export function timeGroup(sheet: Locator, label: string) {
  return sheet.getByRole('radiogroup', { name: label, exact: true }).locator('..');
}

/** The button of a folded time row in the feed sheet ("Start: now · change"), whatever time it says. */
export function foldedTimeButton(sheet: Locator, key: 'feed.startAt' | 'feed.endAt') {
  const [before, after] = t(key).split('{when}').map(escapeRegExp);
  return sheet.getByRole('button', { name: new RegExp(`^${before}.+${after}$`) });
}

/** Opens the feed sheet's start time chips (feed.startAt) and returns them. */
export async function openFeedStart(sheet: Locator) {
  await foldedTimeButton(sheet, 'feed.startAt').click();
  return timeGroup(sheet, t('time.start'));
}

/** Opens the feed sheet's end time chips in "log afterwards" (feed.endAt) and returns them. */
export async function openFeedEnd(sheet: Locator) {
  await foldedTimeButton(sheet, 'feed.endAt').click();
  return timeGroup(sheet, t('time.ended'));
}

/** The minutes field of one side in the feed sheet's "log afterwards" (sideMinutes.value). */
export function sideMinutesField(sheet: Locator, side: 'L' | 'R') {
  // A spinbutton: the side's chip group carries the same name.
  return sheet.getByRole('spinbutton', {
    name: t('sideMinutes.value', { side: t(`side.${side}.button`) }),
    exact: true,
  });
}

/**
 * Logs a finished feed from an open feed sheet ("log afterwards", feed.later): types the minutes per side
 * and, when given, picks the end time ("2026-09-25T09:50"), then saves.
 */
export async function logFeedAfterwards(
  sheet: Locator,
  minutes: { left?: number; right?: number; end?: string },
) {
  if (minutes.left !== undefined) await sideMinutesField(sheet, 'L').fill(String(minutes.left));
  if (minutes.right !== undefined) await sideMinutesField(sheet, 'R').fill(String(minutes.right));
  if (minutes.end) await pickTime(await openFeedEnd(sheet), minutes.end);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
}

/** Logs a wet diaper from a card (the first card by default), now or at a picked time. */
export async function logDiaper(page: Page, options: { at?: string; baby?: string } = {}) {
  await cardAction(page, 'diaper', options.baby).click();
  const sheet = page.getByRole('dialog', { name: t('quick.diaper') });
  if (options.at) await pickTime(sheet, options.at);
  await sheet.getByRole('button', { name: t('common.save'), exact: true }).click();
  await expect(sheet).toBeHidden();
}

export type OtherEntry = 'medication' | 'growth' | 'temperature' | 'healthNote';

/** Opens a card's "Other" sheet (other.title), picks the entry type and returns the sheet (its title is then the type's). */
export async function openOther(page: Page, type: OtherEntry, baby?: string) {
  await cardAction(page, 'other', baby).click();
  const sheet = page.getByRole('dialog');
  // The row's accessible name is the type's name followed by its caption, so a substring match finds it.
  await sheet.getByRole('button', { name: t(`other.chip.${type}`) }).click();
  return sheet;
}

/** Opens the standalone pumping sheet from Home's pumping button (no baby needed) and returns it. */
export async function openPump(page: Page) {
  await page.getByRole('button', { name: t('home.pump'), exact: true }).click();
  return page.getByRole('dialog', { name: t('sheet.pump.title'), exact: true });
}

export type SummaryTileKey = 'sleep' | 'feeds' | 'bottle' | 'diapers';

/** The lines of one of the summary tab's four hero tiles (summary.tile.*): its label, its value and, when there is one, its diff. */
export function summaryTileLines(page: Page, key: SummaryTileKey) {
  return page.getByTestId(`summary-tile-${key}`).locator(':scope > div');
}

/** A card of the summary tab that has no accessible name of its own (the week chart, summary.week), found by its h2 title. */
export function summaryCard(page: Page, title: string) {
  return page.getByRole('heading', { name: title, exact: true }).locator('..');
}

/** A baby card's feed tile (status.feed): scopes a bottle amount to it, so it is not confused with the today line, which shows the same ml total. */
export function feedTile(page: Page, baby?: string) {
  const card = baby ? babyCard(page, baby) : page.getByRole('article').first();
  return card.locator('dl > div').filter({
    has: page.locator('dt', { hasText: new RegExp(`^${escapeRegExp(t('status.feed'))}$`) }),
  });
}

/** Every row of the events store, read straight from IndexedDB (deleted rows included). */
export function readEvents(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('qundaq');
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('events', 'readonly').objectStore('events').getAll();
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result as Record<string, unknown>[]);
          };
          getAll.onerror = () => reject(getAll.error ?? new Error('indexedDB getAll failed'));
        };
      }),
  );
}
