import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listEventsOverlapping, listGrowth } from '../../db/events';
import { db } from '../../db/instance';
import { addDays, resolveDay } from '../../domain/days';
import { pickBaby, visibleEvents } from '../../domain/filters';
import {
  GROWTH_METRICS,
  dailyTotals,
  growthSeries,
  pumpTotalMl,
  weekTotals,
  type DailyTotals,
  type GrowthMetric,
} from '../../domain/summary';
import type { Baby, GrowthEvent, Id, TrackerEvent } from '../../domain/types';
import { useReportLoadError } from '../ErrorBanner';
import { formatDuration } from '../format';
import { DayPicker } from '../history/DayPicker';
import { dayLabel, formatNumber, weekdayShort } from '../history/describe';
import { useLocale, useT, type TranslateFn } from '../I18nProvider';
import { useLiveQuery } from '../useLiveQuery';
import { useNow } from '../useNow';
import { GrowthChart } from './GrowthChart';

/** Özet's state. It lives in Shell, so it survives tab switches and resets when the app restarts. */
export interface SummaryView {
  day: number | null; // null: today
  babyId: Id | null; // null: the first live baby of lastBabyIds, else the first baby
  metric: GrowthMetric;
}

export const DEFAULT_SUMMARY_VIEW: SummaryView = { day: null, babyId: null, metric: 'weightG' };

interface Props {
  view: SummaryView;
  onViewChange: (next: SummaryView) => void;
  lastBabyIds: readonly Id[];
}

interface SummaryData {
  babies: Baby[];
  babyId: Id | null;
  events: TrackerEvent[];
  growth: GrowthEvent[];
}

/** Babies, the 7 days' entries and the chosen baby's growth, in one live query. */
async function readSummary(chosen: Id | null, preferred: readonly Id[], from: number, to: number): Promise<SummaryData> {
  const babies = await listBabies(db);
  const babyId = pickBaby(babies, chosen, preferred);
  const [events, growth] = await Promise.all([
    listEventsOverlapping(db, from, to, Date.now()),
    babyId === null ? Promise.resolve<GrowthEvent[]>([]) : listGrowth(db, babyId),
  ]);
  return { babies, babyId, events, growth };
}

export function SummaryScreen({ view, onViewChange, lastBabyIds }: Props) {
  const t = useT();
  const tick = useNow();
  const day = resolveDay(view.day, tick);
  const from = addDays(day, -6);
  const to = addDays(day, 1);
  const data = useLiveQuery(
    () => readSummary(view.babyId, lastBabyIds, from, to),
    [view.babyId, lastBabyIds.join(','), from, to],
    useReportLoadError(),
  );
  // The chips stay put while another day loads; the numbers never outlive their day.
  const [knownBabies, setKnownBabies] = useState<readonly Baby[]>([]);
  if (data && data.babies !== knownBabies) setKnownBabies(data.babies);
  const babies = data?.babies ?? knownBabies;
  const set = (patch: Partial<SummaryView>) => onViewChange({ ...view, ...patch });

  if (data?.babyId === null || (data === undefined && babies.length === 0)) {
    return (
      <section aria-busy={data === undefined}>
        <h1>{t('tab.summary')}</h1>
        {data !== undefined && <p className="muted">{t('summary.noBabies')}</p>}
      </section>
    );
  }
  const shownBabyId = data?.babyId ?? pickBaby(babies, view.babyId, lastBabyIds);

  return (
    <section>
      <h1>{t('tab.summary')}</h1>
      {babies.length > 1 && (
        <fieldset className="filter">
          <legend>{t('summary.baby')}</legend>
          <div className="chips">
            {babies.map((baby) => (
              <button
                key={baby.id}
                type="button"
                className="chip"
                aria-pressed={shownBabyId === baby.id}
                onClick={() => set({ babyId: baby.id })}
              >
                {baby.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <DayPicker day={view.day} now={tick} onChange={(next) => set({ day: next })} />
      {data === undefined ? (
        <p className="muted" aria-busy="true" />
      ) : (
        <SummaryBody
          data={data}
          day={day}
          to={to}
          metric={view.metric}
          onMetric={(metric) => set({ metric })}
          now={Math.max(tick, Date.now())}
        />
      )}
    </section>
  );
}

interface BodyProps {
  data: SummaryData;
  day: number;
  to: number;
  metric: GrowthMetric;
  onMetric: (metric: GrowthMetric) => void;
  now: number;
}

function SummaryBody({ data, day, to, metric, onMetric, now }: BodyProps) {
  const t = useT();
  const locale = useLocale();
  const baby = data.babies.find((candidate) => candidate.id === data.babyId);
  if (!baby) return null;
  const events = visibleEvents(data.events, new Set(data.babies.map((candidate) => candidate.id)));
  const totals = dailyTotals(events, baby.id, day, to, now);
  const pumpedToday = events.some((event) => event.type === 'pump' && event.deletedAt === undefined && event.startAt >= day && event.startAt < to);
  return (
    <>
      <div className="card summary-day">
        <h2>{t('summary.dayTitle', { name: baby.name, day: dayLabel(t, locale, day, now) })}</h2>
        <dl className="status">
          <Row label={t('summary.feeds')} value={String(totals.feeds)} />
          <Row label={t('summary.breast')} value={breastText(t, totals)} />
          <Row label={t('summary.bottle')} value={t('summary.bottleValue', { count: totals.bottles, ml: formatNumber(locale, totals.bottleMl) })} />
          <Row
            label={t('summary.sleep')}
            value={
              totals.sleeps > 0
                ? t('summary.sleepValue', { duration: formatDuration(t, totals.sleepMs), count: totals.sleeps })
                : formatDuration(t, totals.sleepMs)
            }
          />
          <Row label={t('summary.diapers')} value={t('summary.diaperValue', { wet: totals.wet, dirty: totals.dirty, total: totals.diapers })} />
        </dl>
      </div>
      {pumpedToday && (
        <div className="card summary-pump">
          <h2>{t('summary.pump')}</h2>
          <p>{t('summary.pumpTotal', { ml: formatNumber(locale, pumpTotalMl(events, day, to)) })}</p>
        </div>
      )}
      <div className="card">
        <h2>{t('summary.week')}</h2>
        <WeekTable week={weekTotals(events, baby.id, day, now)} />
      </div>
      <div className="card">
        <h2>{t('growth.title')}</h2>
        <fieldset className="filter">
          <legend>{t('growth.metric')}</legend>
          <div className="chips">
            {GROWTH_METRICS.map((option) => (
              <button key={option} type="button" className="chip" aria-pressed={metric === option} onClick={() => onMetric(option)}>
                {t(`growth.metric.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <GrowthChart points={growthSeries(data.growth, metric)} metric={metric} color={baby.color} />
      </div>
    </>
  );
}

/** "15 dk (sağ 15 dk)": a side without time is left out, and the brackets too when there was no breastfeeding. */
function breastText(t: TranslateFn, totals: DailyTotals): string {
  const total = formatDuration(t, totals.breastMs);
  const sides = (['L', 'R'] as const)
    .filter((side) => totals.breastMsBySide[side] > 0)
    .map((side) => t(`summary.breastSide.${side}`, { duration: formatDuration(t, totals.breastMsBySide[side]) }));
  return sides.length === 0 ? total : t('summary.breastValue', { total, sides: sides.join(' · ') });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** A real table (newest day first) that wraps inside 320px instead of scrolling sideways. */
function WeekTable({ week }: { week: readonly { dayStart: number; totals: DailyTotals }[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <table className="week" aria-label={t('summary.week')}>
      <thead>
        <tr>
          <th scope="col">{t('summary.col.day')}</th>
          <th scope="col">{t('summary.col.feeds')}</th>
          <th scope="col">{t('summary.col.sleep')}</th>
          <th scope="col">{t('summary.col.diapers')}</th>
        </tr>
      </thead>
      <tbody>
        {week.map(({ dayStart, totals }) => (
          <tr key={dayStart}>
            <th scope="row">{weekdayShort(locale, dayStart)}</th>
            <td>
              {totals.feeds}
              {(totals.breastMs > 0 || totals.bottleMl > 0) && (
                <span className="muted small week-detail">
                  {t('summary.weekFeedDetail', { breast: formatDuration(t, totals.breastMs), ml: formatNumber(locale, totals.bottleMl) })}
                </span>
              )}
            </td>
            <td>{formatDuration(t, totals.sleepMs)}</td>
            <td>{t('summary.weekDiapers', { wet: totals.wet, dirty: totals.dirty })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
