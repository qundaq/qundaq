import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MINUTE } from '../../src/domain/time';
import type { TypeFilter } from '../../src/domain/filters';
import type { EventDraft, EventType, TrackerEvent } from '../../src/domain/types';
import { translate, type Locale, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import {
  ActivityGroups,
  groupTotalsParts,
  toggleCollapsed,
} from '../../src/ui/history/ActivityGroups';
import { dayHeading, typeIcon, typeLabel } from '../../src/ui/history/describe';
import { DayList, DEFAULT_LOG_VIEW } from '../../src/ui/history/LogScreen';
import { ICONS } from '../../src/ui/shared/icons';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const NOW = at(27, 12); // a Sunday
const ada = { id: 'a', name: 'Ada', color: '#5cc0d2', archived: false, createdAt: 0, updatedAt: 0 };
const cal = { id: 'c', name: 'Cal', color: '#e58fb1', archived: false, createdAt: 0, updatedAt: 0 };
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
    twins?: boolean;
  } = {},
) {
  const locale = options.locale ?? 'tr';
  return renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <ActivityGroups
        events={events}
        babies={options.twins ? [ada, cal] : [ada]}
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
  it('starts by activity with every group expanded', () => {
    expect(DEFAULT_LOG_VIEW.group).toBe('activity');
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

  it('formats the totals parts with the locale and leaves out a zero total', () => {
    expect(groupTotalsParts(en, 'en', 'bottle', { count: 14, ml: 1260 })).toEqual([
      en('log.group.count', { n: 14 }),
      en('unit.ml', { ml: '1,260' }),
    ]);
    expect(groupTotalsParts(tr, 'tr', 'breastfeed', { count: 1, minutes: 0 })).toEqual([
      tr('log.group.count.one'),
    ]);
    expect(groupTotalsParts(tr, 'tr', 'pump', { count: 2, ml: 140 })).toEqual([
      tr('log.group.count', { n: 2 }),
      tr('unit.ml', { ml: 140 }),
    ]);
    expect(groupTotalsParts(tr, 'tr', 'sleep', { count: 2, minutes: 450 })).toEqual([
      tr('log.group.count', { n: 2 }),
      tr('time.hoursMinutes', { h: 7, m: 30 }),
    ]);
  });

  it('a running feed adds to the count but not to the minutes, which its row shows as ongoing', () => {
    const running = ev('f3', {
      type: 'breastfeed',
      babyId: 'a',
      startAt: at(27, 11, 30),
      segments: [{ side: 'L', start: at(27, 11, 30) }],
    });
    const html = render([...DAY, running]);
    expect(headings(html, 3)[0]).toBe(
      `${typeLabel(tr, 'breastfeed')} ${tr('log.group.count', { n: 3 })} · ${tr('time.minutes', { m: 25 })}`,
    );
    expect(html).toContain(`${tr('side.L.button')} · ${tr('log.ongoing')}`);
    // Only a running feed: the count alone.
    expect(headings(render([running]), 3)).toEqual([
      `${typeLabel(tr, 'breastfeed')} ${tr('log.group.count.one')}`,
    ]);
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

/** The markup of every row list (the `<ul>`s), so a group heading's own icon and name never count as a row's. */
const rowLists = (html: string) => [...html.matchAll(/<ul[^>]*>.*?<\/ul>/g)].map((m) => m[0]);

describe('compact rows inside the groups', () => {
  const ADA_AND_CAL = [
    bottle('b1', at(27, 3), 90),
    ev('b2', { type: 'bottle', babyId: 'c', startAt: at(27, 4), ml: 60, contents: 'formula' }),
    diaper('d1', at(27, 7)),
    ev('d2', { type: 'diaper', babyId: 'c', startAt: at(27, 8), wet: true, dirty: false }),
    pump('p1', at(27, 8), 15, 12),
  ];

  it("leave out the type's name and icon, which the group heading already shows", () => {
    const lists = rowLists(render(ADA_AND_CAL, { twins: true }));
    expect(lists).toHaveLength(3);
    for (const type of ['bottle', 'diaper', 'pump'] as const) {
      expect(lists.join('')).not.toContain(ICONS[typeIcon(type)]);
      expect(text(lists.join(''))).not.toContain(typeLabel(tr, type));
    }
  });

  it('keep the baby (twins stay apart), the time, the detail, and the mother on a pump', () => {
    const [bottles, diapers, pumps] = rowLists(render(ADA_AND_CAL, { twins: true }));
    const rows = (list: string) =>
      [...list.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]!));
    expect(rows(bottles!)).toEqual([
      `03:00Ada${tr('unit.ml', { ml: 90 })} · ${tr('bottle.formula')}`,
      `04:00Cal${tr('unit.ml', { ml: 60 })} · ${tr('bottle.formula')}`,
    ]);
    expect(rows(diapers!)).toEqual([
      `07:00Ada${tr('diaper.wet.button')}`,
      `08:00Cal${tr('diaper.wet.button')}`,
    ]);
    expect(rows(pumps!)).toEqual([
      `08:00 – 08:15${tr('log.mother')}${tr('side.L.button')} ${tr('time.minutes', { m: 15 })} · ${tr('side.R.button')} ${tr('time.minutes', { m: 12 })}`,
    ]);
    // Each baby's colour dot is still there.
    expect(bottles).toContain('background:#5cc0d2');
    expect(bottles).toContain('background:#e58fb1');
  });

  it('leave the time view rows as they were: type icon and name next to the baby', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr">
        <DayList
          events={ADA_AND_CAL}
          babies={[ada, cal]}
          day={at(27, 0)}
          babyFilter={null}
          typeFilter="all"
          now={NOW}
          onOpen={() => {}}
        />
      </I18nProvider>,
    );
    for (const type of ['bottle', 'diaper', 'pump'] as const) {
      expect(html).toContain(ICONS[typeIcon(type)]);
      expect(text(html)).toContain(`· ${typeLabel(tr, type)}`);
    }
    expect(text(html)).toContain(`Cal· ${typeLabel(tr, 'diaper')}`);
    expect(text(html)).toContain(`${tr('log.mother')}· ${typeLabel(tr, 'pump')}`);
  });
});
