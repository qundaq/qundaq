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

function closeLast(segments: readonly BreastSegment[], at: number): BreastSegment[] {
  return segments.map((segment, i) =>
    i === segments.length - 1 && segment.end === undefined ? { ...segment, end: Math.max(at, segment.start) } : segment,
  );
}

export async function stopEvent(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    const event = await db.events.get(id);
    if (!event || event.deletedAt !== undefined || !isOpen(event)) throw new Error(`Event ${id} is not running`);
    const endAt = Math.max(now, event.startAt);
    const next = {
      ...event,
      endAt,
      updatedAt: now,
      ...(event.type === 'breastfeed' ? { segments: closeLast(event.segments, endAt) } : {}),
    } as TrackerEvent;
    await db.events.put(next);
  });
}

export async function switchBreastSide(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    const event = await db.events.get(id);
    if (!event || event.deletedAt !== undefined || event.type !== 'breastfeed' || !isOpen(event)) {
      throw new Error(`Event ${id} is not a running breastfeed`);
    }
    const current = event.segments.at(-1)!;
    const at = Math.max(now, current.start);
    const segments: BreastSegment[] = [...closeLast(event.segments, at), { side: current.side === 'L' ? 'R' : 'L', start: at }];
    await db.events.put({ ...event, segments, updatedAt: now } as TrackerEvent);
  });
}
