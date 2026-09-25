import { newId } from '../domain/ids';
import { ValidationError, isOpen, validateEvent, type RuleViolation } from '../domain/rules';
import type { BreastSegment, EventDraft, Id, TrackerEvent } from '../domain/types';
import type { TrackerDb } from './db';

/** Events that started at/after `since`, plus anything still running (however old). Deleted rows are excluded. */
export async function listRecentEvents(db: TrackerDb, since: number): Promise<TrackerEvent[]> {
  const recent = await db.events.where('startAt').aboveOrEqual(since).toArray();
  const running = await db.events.filter((event) => isOpen(event)).toArray();
  const byId = new Map<Id, TrackerEvent>();
  for (const event of [...running, ...recent]) if (event.deletedAt === undefined) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.startAt - b.startAt);
}

/** Validates every draft (against stored running events and each other) and stores all or none. */
export async function logEvents(db: TrackerDb, drafts: readonly EventDraft[], now = Date.now()): Promise<TrackerEvent[]> {
  if (drafts.length === 0) return [];
  return db.transaction('rw', db.events, async () => {
    const running = await db.events.filter((event) => event.deletedAt === undefined && isOpen(event)).toArray();
    const groupId = drafts.length > 1 ? newId() : undefined;
    const created: TrackerEvent[] = [];
    const violations = new Set<RuleViolation>();
    for (const draft of drafts) {
      for (const violation of validateEvent(draft, [...running, ...created], now)) violations.add(violation);
      created.push({ ...draft, id: newId(), ...(groupId ? { groupId } : {}), createdAt: now, updatedAt: now } as TrackerEvent);
    }
    if (violations.size > 0) throw new ValidationError([...violations]);
    await db.events.bulkAdd(created);
    return created;
  });
}

/** A second "switch side" tap within this window is treated as the same tap. */
export const SWITCH_DEBOUNCE_MS = 2000;

function closeLast(segments: readonly BreastSegment[], at: number): BreastSegment[] {
  return segments.map((segment, i) =>
    i === segments.length - 1 && segment.end === undefined ? { ...segment, end: Math.max(at, segment.start) } : segment,
  );
}

/** The running event ended at `now` (never before it started), with its last breastfeeding segment closed. */
export function stoppedAt(event: TrackerEvent, now: number): TrackerEvent {
  const endAt = Math.max(now, event.startAt);
  return {
    ...event,
    endAt,
    updatedAt: now,
    ...(event.type === 'breastfeed' ? { segments: closeLast(event.segments, endAt) } : {}),
  } as TrackerEvent;
}

async function getLive(db: TrackerDb, id: Id): Promise<TrackerEvent> {
  const event = await db.events.get(id);
  if (!event || event.deletedAt !== undefined) throw new Error(`Event ${id} not found`);
  return event;
}

/** Stops a running event. Returns false (and changes nothing) if it has already been stopped. */
export async function stopEvent(db: TrackerDb, id: Id, now = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (!isOpen(event)) return false;
    await db.events.put(stoppedAt(event, now));
    return true;
  });
}

/**
 * Closes the current side and opens the other. Returns false (and changes nothing) if the feed has
 * already finished, or if the current side began less than SWITCH_DEBOUNCE_MS ago (a double tap).
 */
export async function switchBreastSide(db: TrackerDb, id: Id, now = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (event.type !== 'breastfeed') throw new Error(`Event ${id} is not a breastfeed`);
    if (!isOpen(event)) return false;
    const current = event.segments.at(-1)!;
    if (now - current.start < SWITCH_DEBOUNCE_MS) return false;
    const segments: BreastSegment[] = [...closeLast(event.segments, now), { side: current.side === 'L' ? 'R' : 'L', start: now }];
    await db.events.put({ ...event, segments, updatedAt: now } as TrackerEvent);
    return true;
  });
}
