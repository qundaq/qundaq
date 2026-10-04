import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { addDays, startOfDay } from '../../src/domain/days';
import { DEFAULT_RANGE, customRange, type RangeChoice } from '../../src/domain/ranges';
import type { TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import {
  dayHeading,
  dayLabelShort,
  filterSummary,
  pickedDay,
  rangeLabel,
} from '../../src/ui/history/describe';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { BrandRangePicker } from '../../src/ui/history/BrandRangePicker';
import { DayList } from '../../src/ui/history/LogScreen';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);
const NOW = new Date(2026, 8, 27, 10, 0).getTime(); // a Sunday

describe('dayLabelShort', () => {
  it('reads "today"/"yesterday" as usual, and a short date otherwise', () => {
    expect(dayLabelShort(t, 'tr', NOW, NOW)).toBe(t('day.today'));
    const yesterday = new Date(2026, 8, 26).getTime();
    expect(dayLabelShort(t, 'tr', yesterday, NOW)).toBe(t('day.yesterday'));
    const older = new Date(2026, 8, 20).getTime();
    const expectedShortDate = new Intl.DateTimeFormat('tr', {
      day: 'numeric',
      month: 'short',
    }).format(older);
    expect(dayLabelShort(t, 'tr', older, NOW)).toBe(expectedShortDate);
  });
});

describe('pickedDay', () => {
  it('is null for an empty or unparseable value, and for today or later; the picked day otherwise', () => {
    const today = new Date(2026, 8, 27).getTime();
    expect(pickedDay('', today)).toBeNull();
    expect(pickedDay('not-a-date', today)).toBeNull();
    expect(pickedDay('2026-09-27', today)).toBeNull(); // today itself means "clear the override"
    expect(pickedDay('2026-09-20', today)).toBe(new Date(2026, 8, 20).getTime());
  });
});

describe('rangeLabel', () => {
  const day = (d: number) => new Date(2026, 8, d).getTime();
  const short = (d: number) =>
    new Intl.DateTimeFormat('tr', { day: 'numeric', month: 'short' }).format(day(d));
  it('names each quick range', () => {
    for (const preset of ['today', 'yesterday', 'last7', 'last30'] as const)
      expect(rangeLabel(t, 'tr', { kind: 'preset', preset }, NOW)).toBe(t(`range.${preset}`));
  });
  it('reads a custom range of several days as its first and last short dates', () => {
    expect(rangeLabel(t, 'tr', { kind: 'custom', from: day(20), to: day(25) }, NOW)).toBe(
      `${short(20)} – ${short(25)}`,
    );
  });
  it('reads a one-day custom range as that day, "today" and "yesterday" included', () => {
    expect(rangeLabel(t, 'tr', { kind: 'custom', from: day(20), to: day(20) }, NOW)).toBe(
      short(20),
    );
    expect(rangeLabel(t, 'tr', { kind: 'custom', from: day(26), to: day(26) }, NOW)).toBe(
      t('day.yesterday'),
    );
    expect(rangeLabel(t, 'tr', { kind: 'custom', from: day(27), to: day(27) }, NOW)).toBe(
      t('day.today'),
    );
  });
});

describe('dayHeading', () => {
  it('reads "today"/"yesterday", and the short weekday with the date otherwise', () => {
    expect(dayHeading(t, 'tr', startOfDay(NOW), NOW)).toBe(t('day.today'));
    expect(dayHeading(t, 'tr', new Date(2026, 8, 26).getTime(), NOW)).toBe(t('day.yesterday'));
    const older = new Date(2026, 8, 21).getTime();
    expect(dayHeading(t, 'tr', older, NOW)).toBe(
      new Intl.DateTimeFormat('tr', { weekday: 'short', day: 'numeric', month: 'short' }).format(
        older,
      ),
    );
  });
});

describe('range labels and day headings outside this year', () => {
  const withYear = (ms: number) =>
    new Intl.DateTimeFormat('tr', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  const custom = (from: number, to: number): RangeChoice => ({ kind: 'custom', from, to });
  it('a range across New Year names both years', () => {
    const from = new Date(2025, 11, 28).getTime();
    const to = new Date(2026, 0, 3).getTime();
    expect(rangeLabel(t, 'tr', custom(from, to), NOW)).toBe(`${withYear(from)} – ${withYear(to)}`);
  });
  it('a range in a past year names its year, on both ends and for a single day', () => {
    const from = new Date(2025, 2, 1).getTime();
    const to = new Date(2025, 2, 10).getTime();
    expect(rangeLabel(t, 'tr', custom(from, to), NOW)).toBe(`${withYear(from)} – ${withYear(to)}`);
    expect(rangeLabel(t, 'tr', custom(from, from), NOW)).toBe(withYear(from));
  });
  it('a range clamped to 366 days, whose ends share a day and month, tells them apart by year', () => {
    const clamped = customRange(new Date(2024, 0, 1).getTime(), NOW, NOW);
    const label = rangeLabel(t, 'tr', clamped, NOW);
    expect(label).toBe(
      `${withYear(new Date(2025, 8, 27).getTime())} – ${withYear(startOfDay(NOW))}`,
    );
    expect(label).toContain('2025');
    expect(label).toContain('2026');
  });
  it("a day heading of a past year carries the year; this year's do not", () => {
    const past = new Date(2025, 8, 21).getTime();
    expect(dayHeading(t, 'tr', past, NOW)).toBe(
      new Intl.DateTimeFormat('tr', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(past),
    );
    expect(dayHeading(t, 'tr', new Date(2026, 8, 21).getTime(), NOW)).not.toContain('2026');
    expect(rangeLabel(t, 'tr', custom(new Date(2026, 8, 20).getTime(), NOW), NOW)).not.toContain(
      '2026',
    );
  });
});

describe('BrandRangePicker', () => {
  const picker = (range: RangeChoice) =>
    render(<BrandRangePicker range={range} onChange={() => {}} />);
  it('shows a one-day range with the previous/next buttons and its label as the sheet button', () => {
    const html = picker(DEFAULT_RANGE);
    expect(html).toContain(`aria-label="${t('range.title')}: ${t('range.today')}"`);
    expect(html).toContain('data-testid="range-current"');
    expect(html).toContain(`aria-label="${t('day.previous')}"`);
    expect(html).toContain(`aria-label="${t('day.next')}"`);
    const older = addDays(startOfDay(Date.now()), -3);
    const custom = picker({ kind: 'custom', from: older, to: older });
    expect(custom).toContain(`aria-label="${t('day.previous')}"`);
    expect(custom).toContain(`aria-label="${t('day.next')}"`);
  });
  it('shows a longer range with its label only, no step buttons', () => {
    const html = picker({ kind: 'preset', preset: 'last7' });
    expect(html).toContain(t('range.last7'));
    expect(html).not.toContain(`aria-label="${t('day.previous')}"`);
    expect(html).not.toContain(`aria-label="${t('day.next')}"`);
  });
});

describe('filterSummary', () => {
  const ada = {
    id: 'a',
    name: 'Ada',
    color: '#5cc0d2',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  it('reads sheet.all with nothing filtered, and joins whatever is filtered otherwise', () => {
    expect(filterSummary(t, [ada], null, 'all')).toBe(t('sheet.all'));
    expect(filterSummary(t, [ada], 'a', 'all')).toBe('Ada');
    expect(filterSummary(t, [ada], null, 'feeding')).toBe(t('log.type.feeding'));
    expect(filterSummary(t, [ada], 'a', 'feeding')).toBe(`Ada · ${t('log.type.feeding')}`);
  });
});

describe('DayList hour headings', () => {
  const ada = {
    id: 'a',
    name: 'Ada',
    color: '#5cc0d2',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const note = (id: string, hh: number, mm: number, text: string): TrackerEvent => ({
    id,
    type: 'healthNote',
    babyId: 'a',
    startAt: new Date(2026, 8, 27, hh, mm).getTime(),
    note: text,
    createdAt: 0,
    updatedAt: 0,
  });
  const day = new Date(2026, 8, 27).getTime();

  it('inserts one hour heading before the first row at or after that hour, and only then', () => {
    // 08:15 and 09:05 are an hour apart; 09:45 shares 09:05's hour. Newest-first order: 09:45, 09:05, 08:15.
    const events = [
      note('e1', 8, 15, 'first'),
      note('e2', 9, 5, 'second'),
      note('e3', 9, 45, 'third'),
    ];
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr">
        <DayList
          events={events}
          babies={[ada]}
          day={day}
          babyFilter={null}
          typeFilter="all"
          now={Date.now()}
          onOpen={() => {}}
        />
      </I18nProvider>,
    );
    const headings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(headings).toEqual(['09:00', '08:00']);
    // Order in the markup: the 09:00 heading, then the two 09:xx rows (third, then second, no heading
    // between them), then the 08:00 heading, then the 08:xx row.
    const iHeading09 = html.indexOf('>09:00<');
    const iThird = html.indexOf('third');
    const iSecond = html.indexOf('second');
    const iHeading08 = html.indexOf('>08:00<');
    const iFirst = html.indexOf('first');
    expect(iHeading09).toBeGreaterThanOrEqual(0);
    expect(iHeading09).toBeLessThan(iThird);
    expect(iThird).toBeLessThan(iSecond);
    expect(iSecond).toBeLessThan(iHeading08);
    expect(iHeading08).toBeLessThan(iFirst);
  });
});

describe('DayList hour headings across a day boundary', () => {
  const ada = {
    id: 'a',
    name: 'Ada',
    color: '#5cc0d2',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const note = (id: string, dayOfMonth: number, hh: number, mm: number): TrackerEvent => ({
    id,
    type: 'healthNote',
    babyId: 'a',
    startAt: new Date(2026, 8, dayOfMonth, hh, mm).getTime(),
    note: id,
    createdAt: 0,
    updatedAt: 0,
  });
  it("keeps a previous-day hour apart from the picked day's, with the row suffix", () => {
    const html = render(
      <DayList
        events={[note('early', 26, 23, 30), note('late', 27, 23, 10)]}
        babies={[ada]}
        day={new Date(2026, 8, 27).getTime()}
        babyFilter={null}
        typeFilter="all"
        now={Date.now()}
        onOpen={() => {}}
      />,
    );
    const headings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(headings).toEqual(['23:00', `23:00 ${t('log.suffix.previousDay')}`]);
  });
});

describe('DayList same-instant tie-break', () => {
  const ada = {
    id: 'a',
    name: 'Ada',
    color: '#5cc0d2',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const note = (id: string, text: string, startAt: number): TrackerEvent => ({
    id,
    type: 'healthNote',
    babyId: 'a',
    startAt,
    note: text,
    createdAt: 0,
    updatedAt: 0,
  });
  const day = new Date(2026, 8, 27).getTime();

  it('orders two rows sharing the exact same startAt by id, not by array order', () => {
    const startAt = new Date(2026, 8, 27, 9, 0).getTime();
    // Array order deliberately contradicts id order: 'zzz-event' is listed first, but the correct,
    // id-ascending order puts 'aaa-event' first. Without DayList's own compareIds tie-break, the stable
    // sort would keep this array's order and render 'zzz-event' before 'aaa-event'.
    const events = [note('zzz-event', 'zzz-note', startAt), note('aaa-event', 'aaa-note', startAt)];
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr">
        <DayList
          events={events}
          babies={[ada]}
          day={day}
          babyFilter={null}
          typeFilter="all"
          now={Date.now()}
          onOpen={() => {}}
        />
      </I18nProvider>,
    );
    const iAaa = html.indexOf('aaa-note');
    const iZzz = html.indexOf('zzz-note');
    expect(iAaa).toBeGreaterThanOrEqual(0);
    expect(iZzz).toBeGreaterThanOrEqual(0);
    expect(iAaa).toBeLessThan(iZzz);
  });
});

describe('DayList across several days', () => {
  const ada = {
    id: 'a',
    name: 'Ada',
    color: '#5cc0d2',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
  const note = (id: string, dayOfMonth: number, hh: number, mm: number): TrackerEvent => ({
    id,
    type: 'healthNote',
    babyId: 'a',
    startAt: new Date(2026, 8, dayOfMonth, hh, mm).getTime(),
    note: id,
    createdAt: 0,
    updatedAt: 0,
  });
  const list = (events: TrackerEvent[], byDay: boolean) =>
    render(
      <DayList
        events={events}
        babies={[ada]}
        day={new Date(2026, 8, 25).getTime()}
        byDay={byDay}
        babyFilter={null}
        typeFilter="all"
        now={NOW}
        onOpen={() => {}}
      />,
    );
  const headings = (html: string, level: 3 | 4) =>
    [...html.matchAll(new RegExp(`<h${level}[^>]*>([^<]*)</h${level}>`, 'g'))].map((m) => m[1]);

  it('heads each day, newest first, and keeps the same hour on two days apart', () => {
    const html = list([note('older', 26, 9, 10), note('newer', 27, 9, 40)], true);
    expect(headings(html, 3)).toEqual([t('day.today'), t('day.yesterday')]);
    // Plain clock times: the day heading already says the day.
    expect(headings(html, 4)).toEqual(['09:00', '09:00']);
    expect(html).not.toContain(t('log.suffix.previousDay'));
    const order = ['>' + t('day.today') + '<', 'newer', '>' + t('day.yesterday') + '<', 'older'];
    const at = order.map((text) => html.indexOf(text));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('lists an entry carried over from before the range under the day it started on', () => {
    const sleep: TrackerEvent = {
      id: 'carried',
      type: 'sleep',
      babyId: 'a',
      startAt: new Date(2026, 8, 24, 23, 0).getTime(),
      endAt: new Date(2026, 8, 25, 2, 0).getTime(),
      createdAt: 0,
      updatedAt: 0,
    };
    const html = list([sleep, note('later', 25, 8, 0)], true);
    const thursday = new Date(2026, 8, 24).getTime();
    expect(headings(html, 3)).toEqual([
      dayHeading(t, 'tr', new Date(2026, 8, 25).getTime(), NOW),
      dayHeading(t, 'tr', thursday, NOW),
    ]);
    expect(headings(html, 4)).toEqual(['08:00', '23:00']);
    expect(html).toContain(`23:00 – 02:00 ${t('log.suffix.nextDay')}`);
  });

  it('a one-day list has no day headings and marks other days on its rows, as before', () => {
    const html = list([note('early', 24, 23, 30), note('late', 25, 23, 10)], false);
    expect(headings(html, 4)).toEqual([]);
    expect(headings(html, 3)).toEqual(['23:00', `23:00 ${t('log.suffix.previousDay')}`]);
  });
});

describe('DayList formatting cost', () => {
  it('renders 2,000 entries over a month with a handful of formatters, not several per row', () => {
    const ada = {
      id: 'a',
      name: 'Ada',
      color: '#5cc0d2',
      archived: false,
      createdAt: 0,
      updatedAt: 0,
    };
    const start = new Date(2026, 7, 28).getTime();
    const events: TrackerEvent[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `e${String(i).padStart(4, '0')}`,
      type: 'bottle',
      babyId: 'a',
      startAt: start + i * 21 * 60 * 1000,
      ml: 90,
      contents: 'formula',
      note: i % 10 === 0 ? 'note' : undefined,
      createdAt: 0,
      updatedAt: 0,
    }));
    const dates = vi.spyOn(Intl, 'DateTimeFormat');
    const numbers = vi.spyOn(Intl, 'NumberFormat');
    try {
      const html = render(
        <DayList
          events={events}
          babies={[ada]}
          day={start}
          byDay
          babyFilter={null}
          typeFilter="all"
          now={NOW}
          onOpen={() => {}}
        />,
      );
      expect(html.match(/<h3/g)?.length).toBeGreaterThan(25);
      expect(dates.mock.calls.length + numbers.mock.calls.length).toBeLessThan(20);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
