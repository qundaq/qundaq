import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listEventsOverlapping } from '../../db/events';
import { db } from '../../db/instance';
import { addDays, hourOf, resolveDay } from '../../domain/days';
import { compareIds } from '../../domain/ids';
import { matchesFilters, visibleEvents, type TypeFilter } from '../../domain/filters';
import type { Baby, Id, TrackerEvent } from '../../domain/types';
import { useReportLoadError } from '../shared/ErrorBanner';
import { useT } from '../app/I18nProvider';
import { useLiveQuery } from '../shared/useLiveQuery';
import { useNow } from '../shared/useNow';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { EditSheet } from './EditSheet';
import { EventRow } from './EventRow';
import { filterSummary } from './describe';
import { FilterSheet } from './FilterSheet';
import styles from './Log.module.css';

/** The log (history) tab's state. It lives in Shell, so it survives tab switches and resets when the app restarts. */
export interface LogView {
  day: number | null; // null: today
  babyId: Id | null; // null: every baby, pumps included
  type: TypeFilter;
}

export const DEFAULT_LOG_VIEW: LogView = { day: null, babyId: null, type: 'all' };

/** Babies and the day's entries in one live query, so rows never flash in and out. */
async function readDay(
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
  const day = resolveDay(view.day, tick);
  const to = addDays(day, 1);
  const data = useLiveQuery(() => readDay(day, to), [day, to], useReportLoadError());
  // The filter chips stay put while another day loads; the rows never outlive their day.
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
        <DayList
          events={data.events}
          babies={data.babies}
          day={day}
          babyFilter={babyFilter}
          typeFilter={view.type}
          // The tick can be up to 30 s old; data written since then must never look like the future.
          // eslint-disable-next-line react-hooks/purity
          now={Math.max(tick, Date.now())}
          onOpen={setEditing}
        />
      )}
      <EditSheet event={editing} babies={babies} onClose={() => setEditing(null)} />
    </section>
  );
}

/** Visible only for its own markup test; LogScreen is DayList's one real caller. */
export interface DayListProps {
  events: readonly TrackerEvent[];
  babies: readonly Baby[];
  day: number;
  babyFilter: Id | null;
  typeFilter: TypeFilter;
  now: number;
  onOpen: (event: TrackerEvent) => void;
}

export function DayList({
  events,
  babies,
  day,
  babyFilter,
  typeFilter,
  now,
  onOpen,
}: DayListProps) {
  const t = useT();
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
  return (
    <ul className={styles.list} role="list" aria-label={t('log.list')} data-testid="log-list">
      {rows.map((event, i) => {
        const hour = hourOf(event.startAt);
        const showHeading = i === 0 || hour !== hourOf(rows[i - 1]!.startAt);
        return (
          <li key={event.id}>
            {showHeading && (
              <h3 className={styles.hourHeading}>{String(hour).padStart(2, '0')}:00</h3>
            )}
            <EventRow
              event={event}
              baby={event.babyId === null ? null : (byId.get(event.babyId) ?? null)}
              day={day}
              now={now}
              onOpen={() => onOpen(event)}
            />
          </li>
        );
      })}
    </ul>
  );
}
