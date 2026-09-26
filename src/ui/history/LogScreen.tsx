import { useState } from 'react';
import { listBabies } from '../../db/babies';
import { listEventsOverlapping } from '../../db/events';
import { db } from '../../db/instance';
import { addDays, resolveDay } from '../../domain/days';
import { TYPE_FILTERS, matchesFilters, visibleEvents, type TypeFilter } from '../../domain/filters';
import type { Baby, Id, TrackerEvent } from '../../domain/types';
import { useReportLoadError } from '../ErrorBanner';
import { useT } from '../I18nProvider';
import { useLiveQuery } from '../useLiveQuery';
import { useNow } from '../useNow';
import { DayPicker } from './DayPicker';
import { EditSheet } from './EditSheet';
import { EventRow } from './EventRow';

/** Günlük's state. It lives in Shell, so it survives tab switches and resets when the app restarts. */
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
  const babyFilter =
    babies.length > 1 && view.babyId !== null && babies.some((baby) => baby.id === view.babyId)
      ? view.babyId
      : null;
  const set = (patch: Partial<LogView>) => onViewChange({ ...view, ...patch });

  return (
    <section>
      <h1>{t('tab.log')}</h1>
      <DayPicker day={view.day} now={tick} onChange={(next) => set({ day: next })} />
      {babies.length > 1 && (
        <fieldset className="filter">
          <legend>{t('log.filter.baby')}</legend>
          <div className="chips">
            <button
              type="button"
              className="chip"
              aria-pressed={babyFilter === null}
              onClick={() => set({ babyId: null })}
            >
              {t('sheet.all')}
            </button>
            {babies.map((baby) => (
              <button
                key={baby.id}
                type="button"
                className="chip"
                aria-pressed={babyFilter === baby.id}
                onClick={() => set({ babyId: baby.id })}
              >
                {baby.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="filter">
        <legend>{t('log.filter.type')}</legend>
        <div className="chips">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className="chip"
              aria-pressed={view.type === filter}
              onClick={() => set({ type: filter })}
            >
              {t(`log.type.${filter}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {data === undefined ? (
        <p className="muted" aria-busy="true" />
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

interface DayListProps {
  events: readonly TrackerEvent[];
  babies: readonly Baby[];
  day: number;
  babyFilter: Id | null;
  typeFilter: TypeFilter;
  now: number;
  onOpen: (event: TrackerEvent) => void;
}

function DayList({ events, babies, day, babyFilter, typeFilter, now, onOpen }: DayListProps) {
  const t = useT();
  const byId = new Map(babies.map((baby) => [baby.id, baby]));
  const rows = visibleEvents(events, new Set(byId.keys()))
    .filter((event) => matchesFilters(event, babyFilter, typeFilter))
    .sort((a, b) => b.startAt - a.startAt);
  if (rows.length === 0) {
    return (
      <p className="muted">
        {t(babyFilter !== null || typeFilter !== 'all' ? 'log.emptyFiltered' : 'log.empty')}
      </p>
    );
  }
  return (
    <ul className="log-list" role="list" aria-label={t('log.list')}>
      {rows.map((event) => (
        <li key={event.id}>
          <EventRow
            event={event}
            baby={event.babyId === null ? null : (byId.get(event.babyId) ?? null)}
            day={day}
            now={now}
            onOpen={() => onOpen(event)}
          />
        </li>
      ))}
    </ul>
  );
}
