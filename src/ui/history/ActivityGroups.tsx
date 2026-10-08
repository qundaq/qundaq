import { useId } from 'react';
import { dayOffset, startOfDay } from '../../domain/days';
import { matchesFilters, visibleEvents, type TypeFilter } from '../../domain/filters';
import { MINUTE } from '../../domain/time';
import type { Baby, EventType, Id, TrackerEvent } from '../../domain/types';
import type { Locale } from '../../i18n';
import { useLocale, useT, type TranslateFn } from '../app/I18nProvider';
import { cx } from '../shared/cx';
import { formatDuration } from '../shared/format';
import { Icon } from '../shared/Icon';
import { EventRow } from './EventRow';
import { dayHeading, formatNumber, typeIcon, typeLabel } from './describe';
import { groupByActivity, groupSummary, type ActivityGroup, type GroupSummary } from './groups';
import styles from './Log.module.css';

/** The collapsed set with `type` flipped: collapsed types open, open ones collapse. */
export function toggleCollapsed(collapsed: readonly EventType[], type: EventType): EventType[] {
  return collapsed.includes(type)
    ? collapsed.filter((other) => other !== type)
    : [...collapsed, type];
}

/**
 * The parts of a group header's totals: ["5 entries", "90 min"], ["3 entries", "270 ml"], ["6 entries"].
 * Sleep reads as a duration; breastfeeding and pumping in plain minutes like the pumping report. A zero
 * total (a sleep that has only just started, or only running feeds) is left out.
 */
export function groupTotalsParts(
  t: TranslateFn,
  locale: Locale,
  type: EventType,
  summary: GroupSummary,
): string[] {
  const parts = [
    summary.count === 1
      ? t('log.group.count.one')
      : t('log.group.count', { n: formatNumber(locale, summary.count) }),
  ];
  if (summary.minutes)
    parts.push(
      type === 'sleep'
        ? formatDuration(t, summary.minutes * MINUTE)
        : t('time.minutes', { m: formatNumber(locale, summary.minutes) }),
    );
  if (summary.ml) parts.push(t('unit.ml', { ml: formatNumber(locale, summary.ml) }));
  return parts;
}

export interface ActivityGroupsProps {
  events: readonly TrackerEvent[];
  babies: readonly Baby[];
  /** The start of the (first) day shown: a one-day range marks times on other days relative to it. */
  day: number;
  /** A range of several days: each group's rows sit under a heading per day they start on. */
  byDay?: boolean;
  babyFilter: Id | null;
  typeFilter: TypeFilter;
  collapsed: readonly EventType[];
  now: number;
  onToggle: (type: EventType) => void;
  onOpen: (event: TrackerEvent) => void;
}

/** The log's "by activity" view: one collapsible group per entry type, each oldest first. */
export function ActivityGroups({
  events,
  babies,
  day,
  byDay = false,
  babyFilter,
  typeFilter,
  collapsed,
  now,
  onToggle,
  onOpen,
}: ActivityGroupsProps) {
  const t = useT();
  const byId = new Map(babies.map((baby) => [baby.id, baby]));
  const shown = visibleEvents(events, new Set(byId.keys())).filter((event) =>
    matchesFilters(event, babyFilter, typeFilter),
  );
  const groups = groupByActivity(shown);
  if (groups.length === 0) {
    return (
      <p className={styles.muted}>
        {t(babyFilter !== null || typeFilter !== 'all' ? 'log.emptyFiltered' : 'log.empty')}
      </p>
    );
  }
  return (
    <div className={styles.groups} data-testid="log-groups">
      {groups.map((group) => (
        <Group
          key={group.type}
          group={group}
          byId={byId}
          day={day}
          byDay={byDay}
          expanded={!collapsed.includes(group.type)}
          now={now}
          onToggle={() => onToggle(group.type)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function Group({
  group,
  byId,
  day,
  byDay,
  expanded,
  now,
  onToggle,
  onOpen,
}: {
  group: ActivityGroup;
  byId: ReadonlyMap<Id, Baby>;
  day: number;
  byDay: boolean;
  expanded: boolean;
  now: number;
  onToggle: () => void;
  onOpen: (event: TrackerEvent) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const panelId = useId();
  const title = typeLabel(t, group.type);
  const totals = groupTotalsParts(t, locale, group.type, groupSummary(group, now));
  return (
    <div>
      <h3 className={styles.groupHeading}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <Icon
            name="chevron-right"
            className={cx(styles.chevron, expanded && styles.chevronOpen)}
          />
          <span className={styles.typeIcon}>
            <Icon name={typeIcon(group.type)} size={16} />
          </span>
          <span className={styles.groupText}>
            <span>{title}</span>{' '}
            <span className={styles.groupTotals}>
              {totals.map((part, i) => (
                <span key={i}>
                  <span className={styles.keep}>{part}</span>
                  {i < totals.length - 1 && ' · '}
                </span>
              ))}
            </span>
          </span>
        </button>
      </h3>
      {/* Collapsed: the panel stays (aria-controls points at it) but holds no rows, so none can take focus. */}
      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <ul className={styles.groupList} role="list" aria-label={title}>
            {group.events.map((event, i) => {
              const previous = group.events[i - 1];
              // As in the time view: a multi-day range measures each row against the day it starts on,
              // a one-day range against the picked day.
              const rowDay = byDay ? startOfDay(event.startAt) : day;
              const newDay = byDay && (!previous || dayOffset(rowDay, previous.startAt) !== 0);
              return (
                <li key={event.id}>
                  {newDay && (
                    <h4 className={styles.groupDay}>{dayHeading(t, locale, rowDay, now)}</h4>
                  )}
                  <EventRow
                    event={event}
                    baby={event.babyId === null ? null : (byId.get(event.babyId) ?? null)}
                    day={rowDay}
                    now={now}
                    compact
                    onOpen={() => onOpen(event)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
