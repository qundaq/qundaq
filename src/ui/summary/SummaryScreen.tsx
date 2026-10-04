import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listEventsOverlapping, listGrowth } from '../../db/events';
import { db } from '../../db/instance';
import { addDays, resolveDay, startOfDay } from '../../domain/days';
import { daySchedule } from '../../domain/dayStrip';
import { pickBaby, visibleEvents } from '../../domain/filters';
import {
  GROWTH_METRICS,
  dailyTotals,
  growthSeries,
  pumpReport,
  weekTotals,
  type GrowthMetric,
} from '../../domain/summary';
import type { Baby, GrowthEvent, Id, TrackerEvent } from '../../domain/types';
import { useReportLoadError } from '../shared/ErrorBanner';
import { DayPicker } from '../history/DayPicker';
import { useT } from '../app/I18nProvider';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useNow } from '../shared/useNow';
import { Card } from '../shared/Card';
import { Chip } from '../shared/Chip';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { BabySwitcher } from './BabySwitcher';
import { DayStrip, type DayStripBaby } from './DayStrip';
import { PumpCard } from './PumpCard';
import { GrowthChart } from './GrowthChart';
import { SummaryTiles } from './SummaryTiles';
import { WeekChart, type Metric } from './WeekChart';
import styles from './Summary.module.css';

/** The summary tab's state. It lives in Shell, so it survives tab switches and resets when the app restarts. */
export interface SummaryView {
  day: number | null; // null: today
  babyId: Id | null; // null: the first baby
  metric: GrowthMetric;
}

export const DEFAULT_SUMMARY_VIEW: SummaryView = { day: null, babyId: null, metric: 'weightG' };

interface Props {
  view: SummaryView;
  onViewChange: (next: SummaryView) => void;
}

interface SummaryData {
  babies: Baby[];
  babyId: Id | null;
  events: TrackerEvent[];
  growth: GrowthEvent[];
}

/** Babies, the 7 days' entries and the chosen baby's growth, in one live query. */
async function readSummary(chosen: Id | null, from: number, to: number): Promise<SummaryData> {
  const babies = await listBabies(db);
  const babyId = pickBaby(babies, chosen);
  const [events, growth] = await Promise.all([
    listEventsOverlapping(db, from, to, Date.now()),
    babyId === null ? Promise.resolve<GrowthEvent[]>([]) : listGrowth(db, babyId),
  ]);
  return { babies, babyId, events, growth };
}

export function SummaryScreen({ view, onViewChange }: Props) {
  const t = useT();
  const tick = useNow();
  const day = resolveDay(view.day, tick);
  const from = addDays(day, -6);
  const to = addDays(day, 1);
  const data = useLiveQuery(
    () => readSummary(view.babyId, from, to),
    [view.babyId, from, to],
    useReportLoadError(),
  );
  // The chips stay put while another day loads; the numbers never outlive their day.
  const [knownBabies, setKnownBabies] = useState<readonly Baby[]>([]);
  if (data && data.babies !== knownBabies) setKnownBabies(data.babies);
  // Held here, not in the week chart: the body remounts while another day or baby loads, and the
  // Sleep/Feeding/Pumping choice must survive that. It opens on Sleep each time the summary tab does.
  const [weekMetric, setWeekMetric] = useState<Metric>('sleep');
  const babies = data?.babies ?? knownBabies;
  const set = (patch: Partial<SummaryView>) => onViewChange({ ...view, ...patch });

  if (data?.babyId === null || (data === undefined && babies.length === 0)) {
    return (
      <section aria-busy={data === undefined}>
        <VisuallyHidden as="h1">{t('tab.summary')}</VisuallyHidden>
        {data !== undefined && <p className={styles.muted}>{t('summary.noBabies')}</p>}
      </section>
    );
  }
  const shownBabyId = data?.babyId ?? pickBaby(babies, view.babyId);

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.summary')}</VisuallyHidden>
      <BabySwitcher
        babies={babies}
        // Never null here: the no-baby branch above already returned for data.babyId === null and for an empty list.
        selected={shownBabyId!}
        onChange={(babyId) => set({ babyId })}
      />
      <DayPicker day={view.day} now={tick} onChange={(next) => set({ day: next })} />
      {data === undefined ? (
        <p className={styles.muted} aria-busy="true" />
      ) : (
        <SummaryBody
          data={data}
          day={day}
          to={to}
          metric={view.metric}
          onMetric={(metric) => set({ metric })}
          weekMetric={weekMetric}
          onWeekMetric={setWeekMetric}
          // The tick can be up to 30 s old; data written since then must never look like the future.
          // eslint-disable-next-line react-hooks/purity
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
  weekMetric: Metric;
  onWeekMetric: (metric: Metric) => void;
  now: number;
}

function SummaryBody({
  data,
  day,
  to,
  metric,
  onMetric,
  weekMetric,
  onWeekMetric,
  now,
}: BodyProps) {
  const t = useT();
  const baby = data.babies.find((candidate) => candidate.id === data.babyId);
  if (!baby) return null;
  const events = visibleEvents(data.events, new Set(data.babies.map((candidate) => candidate.id)));
  const from = addDays(day, -1); // yesterday's window, for the tiles' diff
  const totals = dailyTotals(events, baby.id, day, to, now);
  const previous = dailyTotals(events, baby.id, from, day, now);
  const isToday = day === startOfDay(now);

  const strips: DayStripBaby[] = data.babies.map((candidate) => {
    const candidateTotals = dailyTotals(events, candidate.id, day, to, now);
    return {
      id: candidate.id,
      name: candidate.name,
      color: candidate.color,
      sleepMs: candidateTotals.sleepMs,
      feeds: candidateTotals.feeds,
      schedule: daySchedule(events, candidate.id, day, now),
    };
  });

  // Pumps belong to no baby: the pumping card and chart ignore the baby switcher.
  const weekPump = pumpReport(events, addDays(day, -6), to);
  const dayPump = pumpReport(events, day, to);

  return (
    <>
      <SummaryTiles totals={totals} previous={previous} />
      {/* `to` is addDays(day, 1): the real calendar day, 23 or 25 hours on a daylight-saving change. */}
      <DayStrip babies={strips} nowPct={isToday ? (now - day) / (to - day) : null} />
      <PumpCard day={dayPump} week={weekPump} />
      <WeekChart
        week={weekTotals(events, baby.id, day, now)}
        pump={weekPump.perDay}
        today={startOfDay(now)}
        metric={weekMetric}
        onMetric={onWeekMetric}
      />
      <Card>
        <h2>{t('growth.title')}</h2>
        <fieldset className={styles.filter}>
          <legend>{t('growth.metric')}</legend>
          <div className={styles.chips}>
            {GROWTH_METRICS.map((option) => (
              <Chip key={option} selected={metric === option} onClick={() => onMetric(option)}>
                {t(`growth.metric.${option}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <GrowthChart
          points={growthSeries(data.growth, metric)}
          metric={metric}
          color={baby.color}
        />
      </Card>
    </>
  );
}
