import { compareIds } from '../../domain/ids';
import { MINUTE } from '../../domain/time';
import type { EventType, Side, TrackerEvent } from '../../domain/types';
import { segmentMinutes } from '../log/edits';

/** The order the groups appear in. */
export const GROUP_ORDER: readonly EventType[] = [
  'breastfeed',
  'bottle',
  'sleep',
  'diaper',
  'pump',
  'growth',
  'temperature',
  'medication',
  'healthNote',
];

export interface ActivityGroup {
  type: EventType;
  events: TrackerEvent[]; // oldest first
}

/** The numbers a group header shows; the UI formats them. */
export interface GroupSummary {
  count: number;
  minutes?: number;
  ml?: number;
}

/** One group per type that has entries, in GROUP_ORDER, each oldest first (ties by id). Deleted entries are left out. */
export function groupByActivity(events: readonly TrackerEvent[], now: number): ActivityGroup[] {
  void now;
  return GROUP_ORDER.flatMap((type) => {
    const own = events
      .filter((event) => event.type === type && event.deletedAt === undefined)
      .sort((a, b) => a.startAt - b.startAt || compareIds(a.id, b.id));
    return own.length === 0 ? [] : [{ type, events: own }];
  });
}

const finite = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Minutes the breastfeeding row shows, per side rounded like the row (segmentMinutes) and added up; a
 * running feed counts its open side up to `now`.
 */
function feedMinutes(event: Extract<TrackerEvent, { type: 'breastfeed' }>, now: number): number {
  const bySide = new Map<Side, number>();
  for (const segment of event.segments ?? []) {
    const ms = (segment.end ?? event.endAt ?? now) - segment.start;
    bySide.set(segment.side, (bySide.get(segment.side) ?? 0) + Math.max(0, ms));
  }
  let minutes = 0;
  for (const ms of bySide.values()) minutes += segmentMinutes(ms);
  return minutes;
}

/**
 * Totals for a group header, from the same per-row figures the rows show. A running sleep or feed counts up
 * to `now`. A pump reports minutes when any pump has them, else ml; a running pump has neither yet (its
 * row says "ongoing"), so it adds only to the count.
 */
export function groupSummary(group: ActivityGroup, now: number): GroupSummary {
  const count = group.events.length;
  let minutes = 0;
  let ml = 0;
  for (const event of group.events) {
    switch (event.type) {
      case 'breastfeed':
        minutes += feedMinutes(event, now);
        break;
      case 'bottle':
        ml += finite(event.ml);
        break;
      case 'sleep':
        minutes += Math.floor(Math.max(0, (event.endAt ?? now) - event.startAt) / MINUTE);
        break;
      case 'pump':
        if (event.endAt !== undefined) {
          minutes += finite(event.minLeft) + finite(event.minRight);
          ml += finite(event.mlLeft) + finite(event.mlRight);
        }
        break;
      default:
        break;
    }
  }
  switch (group.type) {
    case 'breastfeed':
    case 'sleep':
      return { count, minutes };
    case 'bottle':
      return { count, ml };
    case 'pump':
      return minutes > 0 ? { count, minutes } : ml > 0 ? { count, ml } : { count };
    default:
      return { count };
  }
}
