import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Baby } from '../../src/domain/types';
import type { DailyTotals } from '../../src/domain/summary';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { BabySwitcher } from '../../src/ui/summary/BabySwitcher';
import { formatTileValue } from '../../src/ui/summary/dashboardModel';
import { SummaryTiles } from '../../src/ui/summary/SummaryTiles';
import { formatDuration } from '../../src/ui/shared/format';
import { MINUTE, HOUR, DAY } from '../../src/domain/time';
import { DayStrip } from '../../src/ui/summary/DayStrip';
import { WeekChart } from '../../src/ui/summary/WeekChart';
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
        totals={totals({ sleepMs: 9 * HOUR + 20 * MINUTE, feeds: 6, bottleMl: 120, diapers: 7 })}
        previous={totals({ sleepMs: 9 * HOUR, feeds: 6, bottleMl: 90, diapers: 6 })}
      />,
    );
    const order = [
      t('summary.tile.sleep'),
      t('summary.tile.feeds'),
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
    expect(html).toContain('6');
    expect(html).toContain(t('unit.ml', { ml: 120 }));
    expect(html).toContain('7');
  });

  it('omits a tile’s diff line when both days are zero, and shows it otherwise', () => {
    const withData = render(
      <SummaryTiles totals={totals({ feeds: 6 })} previous={totals({ feeds: 6 })} />,
    );
    expect(withData).toContain(
      t('summary.diff.same.count', { value: formatTileValue(t, 'count', 6) }),
    );
    const empty = render(<SummaryTiles totals={totals()} previous={totals()} />);
    expect(empty).not.toMatch(/\btileDiff\b/);
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

  it('shows Sleep when told to, with a Segmented tab and seven day labels', () => {
    const html = render(<WeekChart week={week} today={T} metric="sleep" onMetric={() => {}} />);
    expect(html).toMatch(/role="radiogroup"/);
    expect(html).toMatch(new RegExp(`aria-checked="true"[^>]*>${t('summary.week.metric.sleep')}`));
    expect(html.match(/data-testid="week-bar"/g)).toHaveLength(7);
  });

  it('shows Feeding when told to: the choice is the caller’s, so it survives a remount', () => {
    const html = render(<WeekChart week={week} today={T} metric="feeding" onMetric={() => {}} />);
    expect(html).toMatch(
      new RegExp(`aria-checked="true"[^>]*>${t('summary.week.metric.feeding')}`),
    );
    expect(html.match(/data-testid="week-dual-bar"/g)).toHaveLength(7);
    expect(html).not.toMatch(/data-testid="week-bar"/);
  });

  it('gives the sleep bars a text alternative: every day with its sleep', () => {
    const html = render(<WeekChart week={week} today={T} metric="sleep" onMetric={() => {}} />);
    const summary = chronological
      .map((day) => `${weekdayShort('tr', day.dayStart)} ${formatDuration(t, day.totals.sleepMs)}`)
      .join(', ');
    expect(html).toContain(`role="img" aria-label="${summary}"`);
  });

  it('gives the feeding bars a text alternative: every day with its breastfeed time and bottle ml', () => {
    const html = render(<WeekChart week={week} today={T} metric="feeding" onMetric={() => {}} />);
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
    const both = render(<WeekChart week={week} today={T} metric="feeding" onMetric={() => {}} />);
    expect(both).toMatch(/data-testid="week-axis-left"/);
    expect(both).toMatch(/data-testid="week-axis-right"/);
    expect(spacers(both)).toBe(2);
    // Bottles only: no minutes axis on the left, so no left spacer either.
    const bottlesOnly = week.map((day) => ({ ...day, totals: { ...day.totals, breastMs: 0 } }));
    const one = render(
      <WeekChart week={bottlesOnly} today={T} metric="feeding" onMetric={() => {}} />,
    );
    expect(one).not.toMatch(/data-testid="week-axis-left"/);
    expect(spacers(one)).toBe(1);
  });

  it('widens the axis columns and their spacers to fit a 4-digit ml label', () => {
    const big = week.map((day) => ({ ...day, totals: { ...day.totals, bottleMl: 1000 } }));
    const html = render(<WeekChart week={big} today={T} metric="feeding" onMetric={() => {}} />);
    expect(html).toMatch(/data-testid="week-axis-right" style="width:\d{2}px"/);
    const width = Number(/week-axis-right" style="width:(\d+)px/.exec(html)![1]);
    expect(width).toBeGreaterThanOrEqual(32);
    expect(html).toContain(`dualLabelsSpacer" style="width:${width}px"`);
  });

  // Rendering is server-side markup only (no click simulation available), so the empty state is
  // checked with a fully empty week on each tab.
  it('shows the empty state, not an empty chart, when the whole week has no data', () => {
    const empty = week.map((day) => ({ ...day, totals: totals() }));
    for (const metric of ['sleep', 'feeding'] as const) {
      const html = render(<WeekChart week={empty} today={T} metric={metric} onMetric={() => {}} />);
      expect(html, metric).toContain(t('summary.week.empty'));
      expect(html, metric).not.toMatch(/role="img"/);
    }
  });
});
