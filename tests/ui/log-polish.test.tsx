import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { dayLabelShort, filterSummary } from '../../src/ui/history/describe';
import { pickedDay } from '../../src/ui/history/DayPicker';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { BrandDayPicker } from '../../src/ui/history/BrandDayPicker';
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
    expect(dayLabelShort(t, 'tr', older, NOW)).toBe('20 Eyl');
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

describe('BrandDayPicker', () => {
  it('renders the previous/next buttons, the short label, and a native date input', () => {
    const html = render(<BrandDayPicker day={null} onChange={() => {}} />);
    expect(html).toContain(t('day.today'));
    expect(html).toContain(`aria-label="${t('day.previous')}"`);
    expect(html).toContain(`aria-label="${t('day.next')}"`);
    expect(html).toMatch(/type="date"/);
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
  it('reads "Hepsi" with nothing filtered, and joins whatever is filtered otherwise', () => {
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
