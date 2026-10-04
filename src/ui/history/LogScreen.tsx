import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listEventsOverlapping } from '../../db/events';
import { db } from '../../db/instance';
import { dayOffset, hourOf, startOfDay } from '../../domain/days';
import { compareIds } from '../../domain/ids';
import { matchesFilters, visibleEvents, type TypeFilter } from '../../domain/filters';
import { DEFAULT_RANGE, isSingleDay, resolveRange, type RangeChoice } from '../../domain/ranges';
import type { Baby, Id, TrackerEvent } from '../../domain/types';
import { useReportLoadError } from '../shared/ErrorBanner';
import { useLocale, useT } from '../app/I18nProvider';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useNow } from '../shared/useNow';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { pumpReport } from '../../domain/summary';
import { EditSheet } from './EditSheet';
import { EventRow } from './EventRow';
import { dayHeading, filterSummary, timeOnDay } from './describe';
import { FilterSheet } from './FilterSheet';
import { PumpReportCard } from './PumpReportCard';
import styles from './Log.module.css';

/** The log (history) tab's state. It lives in Shell, so it survives tab switches and resets when the app restarts. */
export interface LogView {
  range: RangeChoice;
  babyId: Id | null; // null: every baby, pumps included
  type: TypeFilter;
}

export const DEFAULT_LOG_VIEW: LogView = {
  range: DEFAULT_RANGE,
  babyId: null,
  type: 'all',
};

/** Babies and the range's entries in one live query, so rows never flash in and out. */
async function readRange(
  from: number,
  to: number,
): Promise<{ babies: Baby[]; events: TrackerEvent[] }> {
  const [babies, events] = await Promise.all([
    listBabies(db),
    listEventsOverlapping(db, from, to, Date.now()),
  ]);
  return { babies, events };
}

export function LogScreen({
  view,
  onViewChange,
}: {
  view: LogView;
  onViewChange: (next: LogView) => void;
}) {
  const t = useT();
  const tick = useNow();
  // A quick range follows the clock: "today" moves on at midnight.
  const range = resolveRange(view.range, tick);
  const data = useLiveQuery(
    () => readRange(range.from, range.to),
    [range.from, range.to],
    useReportLoadError(),
  );
  // The filter chips stay put while another range loads; the rows never outlive their range.
  const [knownBabies, setKnownBabies] = useState<readonly Baby[]>([]);
  if (data && data.babies !== knownBabies) setKnownBabies(data.babies);
  const babies = data?.babies ?? knownBabies;
  const [editing, setEditing] = useState<TrackerEvent | null>(null);
  const [filtering, setFiltering] = useState(false);
  const babyFilter =
    babies.length > 1 && view.babyId !== null && babies.some((baby) => baby.id === view.babyId)
      ? view.babyId
      : null;
  const set = (patch: Partial<LogView>) => onViewChange({ ...view, ...patch });

  return (
    <section>
      <VisuallyHidden as="h1">{t('tab.log')}</VisuallyHidden>
      <button type="button" className={styles.filterTrigger} onClick={() => setFiltering(true)}>
        <span>{t('log.filter.trigger')}</span>
        <span className={styles.filterSummary}>
          {filterSummary(t, babies, babyFilter, view.type)}
        </span>
      </button>
      <FilterSheet
        open={filtering}
        onClose={() => setFiltering(false)}
        babies={babies}
        babyId={babyFilter}
        type={view.type}
        onBabyChange={(babyId) => set({ babyId })}
        onTypeChange={(type) => set({ type })}
      />
      {data === undefined ? (
        <p className={styles.muted} aria-busy="true" />
      ) : (
        <>
          {view.type === 'pump' && babyFilter === null && (
            <PumpReportCard
              report={pumpReport(data.events, range.from, range.to)}
              multiDay={!isSingleDay(range)}
            />
          )}
          <DayList
            events={data.events}
            babies={data.babies}
            day={range.from}
            byDay={!isSingleDay(range)}
            babyFilter={babyFilter}
            typeFilter={view.type}
            // The tick can be up to 30 s old; data written since then must never look like the future.
            // eslint-disable-next-line react-hooks/purity
            now={Math.max(tick, Date.now())}
            onOpen={setEditing}
          />
        </>
      )}
      <EditSheet event={editing} babies={babies} onClose={() => setEditing(null)} />
    </section>
  );
}

/** Visible only for its own markup test; LogScreen is DayList's one real caller. */
export interface DayListProps {
  events: readonly TrackerEvent[];
  babies: readonly Baby[];
  /** The start of the (first) day shown: one-day lists mark times on other days relative to it. */
  day: number;
  /** A range of several days: rows grouped under a heading per day they start on, each with plain times. */
  byDay?: boolean;
  babyFilter: Id | null;
  typeFilter: TypeFilter;
  now: number;
  onOpen: (event: TrackerEvent) => void;
}

export function DayList({
  events,
  babies,
  day,
  byDay = false,
  babyFilter,
  typeFilter,
  now,
  onOpen,
}: DayListProps) {
  const t = useT();
  const locale = useLocale();
  const byId = new Map(babies.map((baby) => [baby.id, baby]));
  const rows = visibleEvents(events, new Set(byId.keys()))
    .filter((event) => matchesFilters(event, babyFilter, typeFilter))
    .sort((a, b) => b.startAt - a.startAt || compareIds(a.id, b.id));
  if (rows.length === 0) {
    return (
      <p className={styles.muted}>
        {t(babyFilter !== null || typeFilter !== 'all' ? 'log.emptyFiltered' : 'log.empty')}
      </p>
    );
  }
  // Hour headings sit one level below day headings, which only multi-day lists have.
  const HourHeading = byDay ? 'h4' : 'h3';
  return (
    <ul className={styles.list} role="list" aria-label={t('log.list')} data-testid="log-list">
      {rows.map((event, i) => {
        const previous = rows[i - 1];
        // A multi-day list measures each row against the day it starts on (an entry carried over from
        // before the range sits under its own day); a one-day list against the picked day.
        const rowDay = byDay ? startOfDay(event.startAt) : day;
        const newDay = byDay && (!previous || dayOffset(rowDay, previous.startAt) !== 0);
        // A row from another day never shares a heading with a row of the picked day.
        const newHour =
          !previous ||
          hourOf(event.startAt) !== hourOf(previous.startAt) ||
          dayOffset(rowDay, event.startAt) !== dayOffset(rowDay, previous.startAt);
        const hour = timeOnDay(t, locale, new Date(event.startAt).setMinutes(0, 0, 0), rowDay);
        return (
          <li key={event.id}>
            {newDay && <h3 className={styles.dayHeading}>{dayHeading(t, locale, rowDay, now)}</h3>}
            {newHour && <HourHeading className={styles.hourHeading}>{hour}</HourHeading>}
            <EventRow
              event={event}
              baby={event.babyId === null ? null : (byId.get(event.babyId) ?? null)}
              day={rowDay}
              now={now}
              onOpen={() => onOpen(event)}
            />
          </li>
        );
      })}
    </ul>
  );
}
