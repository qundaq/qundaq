import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MINUTE } from '../../src/domain/time';
import type { TypeFilter } from '../../src/domain/filters';
import type { EventDraft, EventType, TrackerEvent } from '../../src/domain/types';
import { translate, type Locale, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import {
  ActivityGroups,
  groupTotalsText,
  toggleCollapsed,
} from '../../src/ui/history/ActivityGroups';
import { dayHeading, typeLabel } from '../../src/ui/history/describe';
import { DEFAULT_LOG_VIEW } from '../../src/ui/history/LogScreen';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const NOW = at(27, 12); // a Sunday
const ada = { id: 'a', name: 'Ada', color: '#5cc0d2', archived: false, createdAt: 0, updatedAt: 0 };
const ev = (id: string, draft: EventDraft): TrackerEvent => ({
  ...draft,
  id,
  createdAt: 0,
  updatedAt: 0,
});

const feed = (id: string, start: number, left: number, right: number) =>
  ev(id, {
    type: 'breastfeed',
    babyId: 'a',
    startAt: start,
    endAt: start + (left + right) * MINUTE,
    segments: [
      { side: 'L', start, end: start + left * MINUTE },
      { side: 'R', start: start + left * MINUTE, end: start + (left + right) * MINUTE },
    ],
  });
const bottle = (id: string, start: number, ml: number) =>
  ev(id, { type: 'bottle', babyId: 'a', startAt: start, ml, contents: 'formula' });
const sleep = (id: string, start: number, minutes: number) =>
  ev(id, { type: 'sleep', babyId: 'a', startAt: start, endAt: start + minutes * MINUTE });
const diaper = (id: string, start: number) =>
  ev(id, { type: 'diaper', babyId: 'a', startAt: start, wet: true, dirty: false });
const pump = (id: string, start: number, minLeft: number, minRight: number) =>
  ev(id, {
    type: 'pump',
    babyId: null,
    startAt: start,
    endAt: start + Math.max(minLeft, minRight) * MINUTE,
    minLeft,
    minRight,
  });

// One day (Sep 27), listed out of order on purpose.
const DAY = [
  bottle('b2', at(27, 9), 120),
  feed('f1', at(27, 6), 10, 5),
  diaper('d1', at(27, 7)),
  sleep('s1', at(27, 1), 150),
  bottle('b1', at(27, 3), 90),
  pump('p1', at(27, 8), 15, 12),
  feed('f2', at(27, 10), 6, 4),
];

function render(
  events: readonly TrackerEvent[],
  options: {
    collapsed?: readonly EventType[];
    byDay?: boolean;
    typeFilter?: TypeFilter;
    locale?: Locale;
  } = {},
) {
  const locale = options.locale ?? 'tr';
  return renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <ActivityGroups
        events={events}
        babies={[ada]}
        day={at(options.byDay ? 25 : 27, 0)}
        byDay={options.byDay}
        babyFilter={null}
        typeFilter={options.typeFilter ?? 'all'}
        collapsed={options.collapsed ?? []}
        now={NOW}
        onToggle={() => {}}
        onOpen={() => {}}
      />
    </I18nProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]*>/g, '');
const headings = (html: string, level: 3 | 4) =>
  [...html.matchAll(new RegExp(`<h${level}[^>]*>(.*?)</h${level}>`, 'g'))].map((m) => text(m[1]!));
const toggles = (html: string) =>
  [...html.matchAll(/<h3[^>]*><button([^>]*)>/g)].map((m) => {
    const attrs = m[1]!;
    return {
      expanded: /aria-expanded="(true|false)"/.exec(attrs)?.[1],
      controls: /aria-controls="([^"]+)"/.exec(attrs)?.[1],
    };
  });
const order = (html: string, needles: string[]) => {
  const indices = needles.map((needle) => html.indexOf(needle));
  expect(indices.every((i) => i >= 0)).toBe(true);
  return indices;
};

describe('the Log view defaults', () => {
  it('starts in time order with every group expanded', () => {
    expect(DEFAULT_LOG_VIEW.group).toBe('time');
    expect(DEFAULT_LOG_VIEW.collapsed).toEqual([]);
  });
  it('toggles one type in and out of the collapsed set', () => {
    expect(toggleCollapsed([], 'sleep')).toEqual(['sleep']);
    expect(toggleCollapsed(['sleep', 'bottle'], 'sleep')).toEqual(['bottle']);
  });
});

describe('ActivityGroups', () => {
  it('heads one group per type, in the fixed order, each a disclosure button, all expanded', () => {
    const html = render(DAY);
    expect(headings(html, 3).map((h) => h.split(/\d/)[0]!.trim())).toEqual(
      (['breastfeed', 'bottle', 'sleep', 'diaper', 'pump'] as const).map((type) =>
        typeLabel(tr, type),
      ),
    );
    const buttons = toggles(html);
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.expanded).toBe('true');
      expect(html).toContain(`id="${button.controls}"`);
    }
    // Every row is there: seven entries, seven row buttons inside the groups.
    expect(html.match(/<li/g)).toHaveLength(7);
  });

  it('lists each group oldest first', () => {
    const html = render(DAY);
    const [b1, b2] = order(html, [
      `${tr('unit.ml', { ml: 90 })} ·`,
      `${tr('unit.ml', { ml: 120 })} ·`,
    ]);
    expect(b1).toBeLessThan(b2!);
    const [f1, f2] = order(html, ['06:00', '10:00']);
    expect(f1).toBeLessThan(f2!);
  });

  it('a collapsed group keeps its heading but renders none of its rows', () => {
    const html = render(DAY, { collapsed: ['bottle'] });
    const buttons = toggles(html);
    expect(buttons.map((b) => b.expanded)).toEqual(['true', 'false', 'true', 'true', 'true']);
    // The panel the button controls is still there, empty and hidden.
    expect(html).toContain(`<div id="${buttons[1]!.controls}" hidden=""></div>`);
    expect(html).not.toContain(tr('unit.ml', { ml: 90 }) + ' ·');
    expect(html).not.toContain(tr('unit.ml', { ml: 120 }) + ' ·');
    expect(html.match(/<li/g)).toHaveLength(5);
  });

  it('totals each group in its own unit (tr)', () => {
    expect(headings(render(DAY), 3)).toEqual([
      `${typeLabel(tr, 'breastfeed')} ${tr('log.group.count', { n: 2 })} · ${tr('time.minutes', { m: 25 })}`,
      `${typeLabel(tr, 'bottle')} ${tr('log.group.count', { n: 2 })} · ${tr('unit.ml', { ml: 210 })}`,
      `${typeLabel(tr, 'sleep')} ${tr('log.group.count.one')} · ${tr('time.hoursMinutes', { h: 2, m: 30 })}`,
      `${typeLabel(tr, 'diaper')} ${tr('log.group.count.one')}`,
      `${typeLabel(tr, 'pump')} ${tr('log.group.count.one')} · ${tr('time.minutes', { m: 27 })}`,
    ]);
  });

  it('totals each group in its own unit (en)', () => {
    expect(headings(render(DAY, { locale: 'en' }), 3)).toEqual([
      `${typeLabel(en, 'breastfeed')} ${en('log.group.count', { n: 2 })} · ${en('time.minutes', { m: 25 })}`,
      `${typeLabel(en, 'bottle')} ${en('log.group.count', { n: 2 })} · ${en('unit.ml', { ml: 210 })}`,
      `${typeLabel(en, 'sleep')} ${en('log.group.count.one')} · ${en('time.hoursMinutes', { h: 2, m: 30 })}`,
      `${typeLabel(en, 'diaper')} ${en('log.group.count.one')}`,
      `${typeLabel(en, 'pump')} ${en('log.group.count.one')} · ${en('time.minutes', { m: 27 })}`,
    ]);
  });

  it('formats the totals text with the locale and leaves out a zero total', () => {
    expect(groupTotalsText(en, 'en', 'bottle', { count: 14, ml: 1260 })).toBe(
      `${en('log.group.count', { n: 14 })} · ${en('unit.ml', { ml: '1,260' })}`,
    );
    expect(groupTotalsText(tr, 'tr', 'breastfeed', { count: 1, minutes: 0 })).toBe(
      tr('log.group.count.one'),
    );
    expect(groupTotalsText(tr, 'tr', 'pump', { count: 2, ml: 140 })).toBe(
      `${tr('log.group.count', { n: 2 })} · ${tr('unit.ml', { ml: 140 })}`,
    );
  });

  it('a multi-day range heads each day inside a group, oldest day first, with plain times', () => {
    const events = [
      diaper('d3', at(27, 8)),
      diaper('d1', at(25, 22)),
      diaper('d2', at(26, 9)),
      bottle('b1', at(27, 7), 60),
    ];
    const html = render(events, { byDay: true });
    const friday = dayHeading(tr, 'tr', at(25, 0), NOW);
    expect(headings(html, 4)).toEqual([
      tr('day.today'),
      friday,
      tr('day.yesterday'),
      tr('day.today'),
    ]);
    order(html, ['22:00', '09:00', '08:00']).reduce((previous, i) => {
      expect(i).toBeGreaterThan(previous);
      return i;
    }, -1);
    expect(html).not.toContain(tr('log.suffix.previousDay'));
  });

  it('a one-day range has no day headings and marks a carried-over entry on its row', () => {
    const html = render([sleep('s0', at(26, 23), 120), diaper('d1', at(27, 7))]);
    expect(headings(html, 4)).toEqual([]);
    expect(html).toContain(`23:00 ${tr('log.suffix.previousDay')}`);
  });

  it('a type filter leaves only its groups', () => {
    const html = render(DAY, { typeFilter: 'feeding' });
    expect(headings(html, 3).map((h) => h.split(/\d/)[0]!.trim())).toEqual([
      typeLabel(tr, 'breastfeed'),
      typeLabel(tr, 'bottle'),
    ]);
  });

  it('keeps the empty texts of the time view', () => {
    expect(render([])).toContain(tr('log.empty'));
    expect(render([diaper('d1', at(27, 7))], { typeFilter: 'sleep' })).toContain(
      tr('log.emptyFiltered'),
    );
    expect(render([])).not.toContain('<h3');
  });
});
