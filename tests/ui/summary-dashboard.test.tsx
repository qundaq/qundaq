import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Baby, TrackerEvent } from '../../src/domain/types';
import type { DailyTotals } from '../../src/domain/summary';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { BabySwitcher } from '../../src/ui/summary/BabySwitcher';
import { formatTileValue } from '../../src/ui/summary/dashboardModel';
import { SummaryTiles } from '../../src/ui/summary/SummaryTiles';
import { formatDuration } from '../../src/ui/shared/format';
import { MINUTE, HOUR, DAY } from '../../src/domain/time';
import { DayStrip } from '../../src/ui/summary/DayStrip';
import { PumpCard } from '../../src/ui/summary/PumpCard';
import { pumpReport } from '../../src/domain/summary';
import { axisWidthPx } from '../../src/ui/summary/chartGeometry';
import { WeekChart } from '../../src/ui/summary/WeekChart';
import type { PumpChartSeries } from '../../src/ui/summary/dashboardModel';
import { weekdayShort } from '../../src/ui/history/describe';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);
const baby = (id: string, name: string): Baby => ({
  id,
  name,
  color: '#5cc0d2',
  archived: false,
  createdAt: 0,
  updatedAt: 0,
});
const totals = (fields: Partial<DailyTotals> = {}): DailyTotals => ({
  feeds: 0,
  breastMs: 0,
  breastMsBySide: { L: 0, R: 0 },
  bottleMl: 0,
  bottles: 0,
  sleepMs: 0,
  sleeps: 0,
  wet: 0,
  dirty: 0,
  diapers: 0,
  ...fields,
});

describe('BabySwitcher', () => {
  it('renders nothing for one baby', () => {
    expect(
      render(<BabySwitcher babies={[baby('a', 'Ada')]} selected="a" onChange={() => {}} />),
    ).toBe('');
  });
  it('is a radio group, one segment per baby, with a colour dot', () => {
    const html = render(
      <BabySwitcher
        babies={[baby('a', 'Ada'), baby('b', 'Cal')]}
        selected="b"
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/role="radiogroup"/);
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    // The checked radio's own markup (attribute through closing tag) must contain "Cal", the dot span
    // included — written this way (not an adjacency regex) so it does not care where the dot sits.
    const checkedButton = /<button[^>]*aria-checked="true"[^>]*>[\s\S]*?<\/button>/.exec(html);
    expect(checkedButton?.[0]).toContain('Cal');
  });
});

describe('SummaryTiles', () => {
  it('renders the four tiles in order, each with its value', () => {
    const html = render(
      <SummaryTiles
        totals={totals({
          sleepMs: 9 * HOUR + 20 * MINUTE,
          feeds: 6,
          bottles: 1,
          bottleMl: 120,
          diapers: 7,
        })}
        previous={totals({ sleepMs: 9 * HOUR, feeds: 6, bottleMl: 90, diapers: 6 })}
      />,
    );
    const order = [
      t('summary.tile.sleep'),
      t('summary.tile.breastfeed'),
      t('summary.tile.bottle'),
      t('summary.tile.diapers'),
    ];
    let last = -1;
    for (const label of order) {
      const at = html.indexOf(label);
      expect(at, label).toBeGreaterThan(last);
      last = at;
    }
    expect(html).toContain(formatDuration(t, 9 * HOUR + 20 * MINUTE));
    // 6 feeds of which 1 bottle: 5 breastfeeds; the bottle on its own tile with its ml.
    expect(html).toContain(`<span class="tilePart">5</span>`);
    expect(html).toContain(t('summary.tile.bottle.ml', { ml: 120 }));
    expect(html).toContain('7');
  });

  it('omits a tile’s diff line when both days are zero, and shows it otherwise', () => {
    const withData = render(
      <SummaryTiles totals={totals({ diapers: 6 })} previous={totals({ diapers: 6 })} />,
    );
    expect(withData).toContain(
      t('summary.diff.same.count', { value: formatTileValue(t, 'count', 6) }),
    );
    const empty = render(<SummaryTiles totals={totals()} previous={totals()} />);
    expect(empty).not.toMatch(/\btileDiff\b/);
  });

  /** A tile's value and diff lines, as text. */
  const tileLines = (html: string, key: string) => {
    const tile = html.split('data-testid="summary-tile-').find((part) => part.startsWith(key))!;
    const lines = [...tile.matchAll(/<div class="(tileValue|tileDiff)">(.*?)<\/div>/g)];
    return lines.map((line) => line[2]!.replace(/<[^>]+>/g, ''));
  };

  it('shows the breastfeeds (not the bottles) with their minutes, the diff in minutes, in both locales', () => {
    const today = totals({ feeds: 6, bottles: 1, breastMs: 90 * MINUTE, bottleMl: 120 });
    const yesterday = totals({ feeds: 7, breastMs: 70 * MINUTE });
    const turkish = render(<SummaryTiles totals={today} previous={yesterday} />);
    expect(turkish).toContain(t('summary.tile.breastfeed'));
    expect(tileLines(turkish, 'breastfeed')).toEqual([
      `5 ${t('summary.tile.breastfeed.minutes', { m: 90 })}`,
      t('summary.diff.minutes', { sign: '+', value: t('time.minutes', { m: 20 }) }),
    ]);
    expect(tileLines(turkish, 'bottle')).toEqual([
      `1 ${t('summary.tile.bottle.ml', { ml: 120 })}`,
      t('summary.diff.ml', { sign: '+', value: t('unit.ml', { ml: 120 }) }),
    ]);
    const english = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SummaryTiles totals={today} previous={yesterday} />
      </I18nProvider>,
    );
    expect(english).toContain('>Breastfeeding<');
    expect(tileLines(english, 'breastfeed')).toEqual(['5 (90 min)', '+20 min from the day before']);
    expect(tileLines(english, 'bottle')).toEqual(['1 (120 ml)', '+120 ml from the day before']);
  });

  it('wraps a tile value only between its parts', () => {
    const html = render(
      <SummaryTiles totals={totals({ feeds: 1, breastMs: 15 * MINUTE })} previous={totals()} />,
    );
    expect(html).toContain(
      `<span class="tilePart">1</span></span><span> <span class="tilePart">${t('summary.tile.breastfeed.minutes', { m: 15 })}</span>`,
    );
  });

  it('a day of bottles only leaves the breastfeeding tile empty', () => {
    const html = render(
      <SummaryTiles
        totals={totals({ feeds: 3, bottles: 3, bottleMl: 270 })}
        previous={totals({ feeds: 2, bottles: 2 })}
      />,
    );
    expect(tileLines(html, 'breastfeed')).toEqual(['0']);
  });
});

describe('DayStrip', () => {
  const oneBaby = [
    {
      id: 'a',
      name: 'Ada',
      color: '#5cc0d2',
      sleepMs: 2 * HOUR,
      feeds: 1,
      schedule: { sleep: [{ startPct: 0.1, endPct: 0.2 }], feedMarks: [0.5] },
    },
  ];
  it('omits the baby name for a single baby, and never shows a "now" tick on a past day', () => {
    const html = render(<DayStrip babies={oneBaby} nowPct={null} />);
    // The card's aria-label still names the baby (screen readers benefit from it even alone,
    // and the next test relies on it) — what a single baby omits is the visible per-row name
    // badge, `.stripName`, which only earns its keep once there's more than one row to tell apart.
    expect(html).not.toMatch(/\bstripName\b/);
    expect(html).toContain(t('summary.dayStrip.title'));
    expect(html).not.toMatch(/data-testid="now-tick"/);
    // No name column to line up under, so the hour axis spans the full-width strip.
    expect(html).toMatch(/\bstripAxis\b/);
    expect(html).not.toMatch(/\bstripAxisIndented\b/);
  });
  it('names every baby and shows the "now" tick only when the shown day is today', () => {
    const two = [
      oneBaby[0]!,
      {
        id: 'b',
        name: 'Cal',
        color: '#f08ab5',
        sleepMs: HOUR,
        feeds: 2,
        schedule: { sleep: [], feedMarks: [] },
      },
    ];
    const html = render(<DayStrip babies={two} nowPct={0.9} />);
    expect(html).toContain('Ada');
    expect(html).toContain('Cal');
    expect(html).toMatch(/data-testid="now-tick"/);
    // The hour axis is indented by the name column's width, so it sits under the strips.
    expect(html).toMatch(/\bstripAxisIndented\b/);
  });
  it('gives the card an accessible summary built from the same totals it renders', () => {
    const html = render(<DayStrip babies={oneBaby} nowPct={null} />);
    expect(html).toContain(
      t('summary.dayStrip.summary', { name: 'Ada', sleep: formatDuration(t, 2 * HOUR), feeds: 1 }),
    );
  });
});

describe('WeekChart', () => {
  const T = new Date(2026, 8, 27).getTime(); // a local midnight
  const week = Array.from({ length: 7 }, (_, i) => ({
    dayStart: T - i * DAY,
    totals: totals({
      sleepMs: (7 - i) * HOUR,
      breastMs: i === 0 ? 30 * MINUTE : 0,
      bottleMl: i === 0 ? 90 : 0,
    }),
  }));
  // The chart lists oldest first; `week` is newest first.
  const chronological = [...week].reverse();
  const noPump: PumpChartSeries = {
    unit: 'ml',
    days: chronological.map((day) => ({ day: day.dayStart, value: 0 })),
  };
  const pumped: PumpChartSeries = {
    unit: 'ml',
    days: chronological.map((day, i) => ({
      day: day.dayStart,
      value: i === 6 ? 1200 : i === 4 ? 340 : 0,
    })),
  };
  const pumpedMinutes: PumpChartSeries = {
    unit: 'min',
    days: chronological.map((day, i) => ({ day: day.dayStart, value: i === 6 ? 95 : 0 })),
  };

  it('shows Sleep when told to, with a Segmented tab and seven day labels', () => {
    const html = render(
      <WeekChart pump={noPump} week={week} today={T} metric="sleep" onMetric={() => {}} />,
    );
    expect(html).toMatch(/role="radiogroup"/);
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>${t('summary.week.metric.sleep')}`));
    expect(html.match(/data-testid="week-bar"/g)).toHaveLength(7);
  });

  it('shows Feeding when told to: the choice is the caller’s, so it survives a remount', () => {
    const html = render(
      <WeekChart pump={noPump} week={week} today={T} metric="feeding" onMetric={() => {}} />,
    );
    expect(html).toMatch(
      new RegExp(`aria-checked="true"[^>]*>${t('summary.week.metric.feeding')}`),
    );
    expect(html.match(/data-testid="week-dual-bar"/g)).toHaveLength(7);
    expect(html).not.toMatch(/data-testid="week-bar"/);
  });

  it('gives the sleep bars a text alternative: every day with its sleep', () => {
    const html = render(
      <WeekChart pump={noPump} week={week} today={T} metric="sleep" onMetric={() => {}} />,
    );
    const summary = chronological
      .map((day) => `${weekdayShort('tr', day.dayStart)} ${formatDuration(t, day.totals.sleepMs)}`)
      .join(', ');
    expect(html).toContain(`role="img" aria-label="${summary}"`);
  });

  it('gives the feeding bars a text alternative: every day with its breastfeed time and bottle ml', () => {
    const html = render(
      <WeekChart pump={noPump} week={week} today={T} metric="feeding" onMetric={() => {}} />,
    );
    const summary = chronological
      .map(
        (day) =>
          `${weekdayShort('tr', day.dayStart)} ${formatDuration(t, day.totals.breastMs)} · ${t('unit.ml', { ml: day.totals.bottleMl })}`,
      )
      .join(', ');
    expect(html).toContain(`role="img" aria-label="${summary}"`);
  });

  it('lines the feeding labels up under the bars: one spacer per axis that is drawn', () => {
    const spacers = (html: string) => html.match(/\bdualLabelsSpacer\b/g)?.length ?? 0;
    const both = render(
      <WeekChart pump={noPump} week={week} today={T} metric="feeding" onMetric={() => {}} />,
    );
    expect(both).toMatch(/data-testid="week-axis-left"/);
    expect(both).toMatch(/data-testid="week-axis-right"/);
    expect(spacers(both)).toBe(2);
    // Bottles only: no minutes axis on the left, so no left spacer either.
    const bottlesOnly = week.map((day) => ({ ...day, totals: { ...day.totals, breastMs: 0 } }));
    const one = render(
      <WeekChart pump={noPump} week={bottlesOnly} today={T} metric="feeding" onMetric={() => {}} />,
    );
    expect(one).not.toMatch(/data-testid="week-axis-left"/);
    expect(spacers(one)).toBe(1);
  });

  it('widens the axis columns and their spacers to fit a 4-digit ml label', () => {
    const big = week.map((day) => ({ ...day, totals: { ...day.totals, bottleMl: 1000 } }));
    const html = render(
      <WeekChart pump={noPump} week={big} today={T} metric="feeding" onMetric={() => {}} />,
    );
    expect(html).toMatch(/data-testid="week-axis-right" style="width:\d{2}px"/);
    const width = Number(/week-axis-right" style="width:(\d+)px/.exec(html)![1]);
    expect(width).toBeGreaterThanOrEqual(32);
    expect(html).toContain(`dualLabelsSpacer" style="width:${width}px"`);
  });

  it('offers Pumping as a third segment and draws one bar per day on one axis that fits 4 digits', () => {
    const html = render(
      <WeekChart pump={pumped} week={week} today={T} metric="pump" onMetric={() => {}} />,
    );
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>${t('summary.week.metric.pump')}`));
    expect(html.match(/data-testid="week-pump-bar"/g)).toHaveLength(7);
    expect(html).not.toMatch(/data-testid="week-axis-right"/);
    // 1200 ml on a 2000 ceiling: 60 %; 340 on it: 17 %. The axis ticks are 0, 1000, 2000.
    expect(html).toContain('height:60%');
    expect(html).toContain('height:17%');
    const width = Number(/week-axis-left" style="width:(\d+)px/.exec(html)![1]);
    expect(width).toBe(axisWidthPx([0, 1000, 2000]));
    expect(width).toBeGreaterThanOrEqual(32);
    expect(html).toContain(`dualLabelsSpacer" style="width:${width}px"`);
    const summary = pumped.days
      .map((entry) => `${weekdayShort('tr', entry.day)} ${t('unit.ml', { ml: entry.value })}`)
      .join(', ');
    expect(html).toContain(`role="img" aria-label="${summary}"`);
    expect(html).toContain(t('summary.week.pump.ml'));
    expect(html).not.toContain(t('summary.week.pump.min'));
  });

  it('plots minutes when the series is in minutes: caption, ticks and text alternative in minutes', () => {
    const html = render(
      <WeekChart pump={pumpedMinutes} week={week} today={T} metric="pump" onMetric={() => {}} />,
    );
    expect(html).toContain(t('summary.week.pump.min'));
    expect(html).not.toContain(t('summary.week.pump.ml'));
    // 95 min on a 100 ceiling: ticks 0, 50, 100, and the axis as wide as its three-digit label.
    expect(html).toContain('height:95%');
    expect(html).toMatch(/week-axis-left"[^>]*><span>100<\/span><span>50<\/span><span>0<\/span>/);
    const width = Number(/week-axis-left" style="width:(\d+)px/.exec(html)![1]);
    expect(width).toBe(axisWidthPx([0, 50, 100]));
    const summary = pumpedMinutes.days
      .map((entry) => `${weekdayShort('tr', entry.day)} ${t('time.minutes', { m: entry.value })}`)
      .join(', ');
    expect(html).toContain(`role="img" aria-label="${summary}"`);
  });

  // Rendering is server-side markup only (no click simulation available), so the empty state is
  // checked with a fully empty week on each tab.
  it('shows the empty state, not an empty chart, when the whole week has no data', () => {
    const empty = week.map((day) => ({ ...day, totals: totals() }));
    for (const metric of ['sleep', 'feeding', 'pump'] as const) {
      const html = render(
        <WeekChart pump={noPump} week={empty} today={T} metric={metric} onMetric={() => {}} />,
      );
      expect(html, metric).toContain(t('summary.week.empty'));
      expect(html, metric).not.toMatch(/role="img"/);
    }
  });
});

describe('PumpCard', () => {
  const D = new Date(2026, 8, 27).getTime();
  type Amounts = { minLeft?: number; minRight?: number; mlLeft?: number; mlRight?: number };
  const pump = (startAt: number, amounts: Amounts): TrackerEvent => ({
    id: String(startAt),
    type: 'pump',
    babyId: null,
    startAt,
    endAt: startAt,
    ...amounts,
    createdAt: 0,
    updatedAt: 0,
  });
  const card = (events: TrackerEvent[]) => {
    const to = D + DAY;
    // The card's text, without the spans that keep each " · " part of a line on one line.
    return render(
      <PumpCard day={pumpReport(events, D, to)} week={pumpReport(events, D - 6 * DAY, to)} />,
    ).replace(/<\/?span[^>]*>/g, '');
  };
  const min = (m: number) => t('time.minutes', { m });
  const ml = (value: number) => t('unit.ml', { ml: value });
  const totals = (unit: (n: number) => string, total: number, l: number, r: number) =>
    t('pump.report.totals', { total: unit(total), l: unit(l), r: unit(r) });

  it('in minutes: the day’s sessions, totals and sides in minutes, then the 7 days and their average', () => {
    const html = card([
      pump(D + 8 * HOUR, { minLeft: 30, minRight: 25 }),
      pump(D + 15 * HOUR, { minRight: 20 }),
      pump(D - 2 * DAY + HOUR, { minLeft: 15 }),
    ]);
    expect(html).toContain('data-testid="summary-pump"');
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
    expect(html).toContain(t('pump.report.sessions', { n: 2 }));
    expect(html).toContain(totals(min, 75, 30, 45));
    expect(html).toContain(t('pump.report.week', { amount: min(90) }));
    expect(html).toContain(t('pump.report.average', { amount: min(13) }));
    expect(html).not.toContain(' ml');
  });

  it('mixed: the ml line follows the minutes line; the 7-day lines name both units', () => {
    const html = card([
      pump(D + 8 * HOUR, { minLeft: 30, minRight: 25, mlLeft: 60, mlRight: 40 }),
      pump(D - 2 * DAY + HOUR, { minLeft: 15, mlLeft: 70 }),
    ]);
    expect(html).toContain(`<p>${totals(min, 55, 30, 25)}</p><p>${totals(ml, 100, 60, 40)}</p>`);
    expect(html).toContain(t('pump.report.week', { amount: `${min(70)} · ${ml(170)}` }));
    expect(html).toContain(t('pump.report.average', { amount: `${min(10)} · ${ml(24)}` }));
  });

  it('ml only: the ml lines as before pumping had minutes', () => {
    const html = card([
      pump(D + 8 * HOUR, { mlLeft: 60, mlRight: 40 }),
      pump(D + 15 * HOUR, { mlRight: 50 }),
      pump(D - 2 * DAY + HOUR, { mlLeft: 70 }),
    ]);
    expect(html).toContain(t('pump.report.sessions', { n: 2 }));
    expect(html).toContain(totals(ml, 150, 60, 90));
    expect(html).toContain(t('pump.report.week', { amount: ml(220) }));
    expect(html).toContain(t('pump.report.average', { amount: ml(31) }));
    expect(html).not.toContain(min(0));
  });

  it('is no card at all when the 7 days have no pump, nor while the only pump still runs', () => {
    expect(card([])).toBe('');
    const running: TrackerEvent = {
      id: 'r',
      type: 'pump',
      babyId: null,
      startAt: D + 8 * HOUR,
      side: 'B',
      createdAt: 0,
      updatedAt: 0,
    };
    expect(card([running])).toBe('');
  });

  it('says "1 session" with the singular text', () => {
    expect(card([pump(D + 8 * HOUR, { minLeft: 10 })])).toContain(t('pump.report.sessions.one'));
  });

  it('keeps the 7-day lines alone when only the shown day has no pump', () => {
    const html = card([pump(D - 3 * DAY + HOUR, { minLeft: 70 })]);
    expect(html).toContain(t('pump.report.week', { amount: min(70) }));
    expect(html).toContain(t('pump.report.average', { amount: min(10) }));
    expect(html).not.toContain(t('pump.report.sessions', { n: 0 }));
    expect(html).not.toContain(totals(min, 0, 0, 0));
  });
});
