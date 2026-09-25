import { newId } from '../domain/ids';
import { ValidationError, isOpen, isTimedType, validateEvent, type RuleViolation } from '../domain/rules';
import { DAY } from '../domain/time';
import type { BreastSegment, EventDraft, GrowthEvent, Id, MedicationEvent, TrackerEvent } from '../domain/types';
import type { TrackerDb } from './db';

/** Running (open) events, found through the sparse `open` index instead of scanning the table. */
export async function listRunningEvents(db: TrackerDb): Promise<TrackerEvent[]> {
  return db.events.where('open').equals(1).toArray();
}

/** Events that started at/after `since`, plus anything still running (however old). Deleted rows are excluded. */
export async function listRecentEvents(db: TrackerDb, since: number): Promise<TrackerEvent[]> {
  const recent = await db.events.where('startAt').aboveOrEqual(since).toArray();
  const running = await listRunningEvents(db);
  const byId = new Map<Id, TrackerEvent>();
  for (const event of [...running, ...recent]) if (event.deletedAt === undefined) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.startAt - b.startAt);
}

/**
 * How far before a window listEventsOverlapping looks for finished timers that reach into it. A finished
 * entry that began even earlier (a sleep longer than two days, which the duration rule refuses) is shown
 * only on the days inside this look-back.
 */
export const OVERLAP_LOOKBACK_MS = 2 * DAY;

function overlaps(event: TrackerEvent, from: number, to: number, now: number): boolean {
  if (!isTimedType(event.type)) return event.startAt >= from && event.startAt < to;
  return event.startAt < to && (event.endAt ?? now) > from;
}

/**
 * Non-deleted events that overlap [from, to), oldest first. Instant entries count when they happen inside
 * the window; timers when any part of them does, a running one lasting until `now`.
 */
export async function listEventsOverlapping(db: TrackerDb, from: number, to: number, now: number): Promise<TrackerEvent[]> {
  const [candidates, running] = await Promise.all([
    db.events.where('startAt').between(from - OVERLAP_LOOKBACK_MS, to, true, false).toArray(),
    listRunningEvents(db),
  ]);
  const byId = new Map<Id, TrackerEvent>();
  for (const event of [...candidates, ...running]) {
    if (event.deletedAt === undefined && overlaps(event, from, to, now)) byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.startAt - b.startAt);
}

/**
 * One baby's non-deleted growth entries, oldest first. Read through the `type` index: growth rows are a
 * few dozen a year, while the baby's other events run to thousands.
 */
export async function listGrowth(db: TrackerDb, babyId: Id): Promise<GrowthEvent[]> {
  const rows = await db.events
    .where('type')
    .equals('growth')
    .filter((event) => event.babyId === babyId && event.deletedAt === undefined)
    .sortBy('startAt');
  return rows.filter((event): event is GrowthEvent => event.type === 'growth');
}

export interface RecentMedication {
  name: string;
  dose?: string;
}

export const RECENT_MEDICATION_WINDOW_MS = 60 * DAY;

/** Case-insensitive key that treats İ/I/ı/i alike, so "İbuprofen" and "ibuprofen" are one medicine. */
function foldCase(name: string): string {
  return name.normalize('NFKD').replace(/\u0307/g, '').toLowerCase().replace(/ı/g, 'i');
}

/**
 * Distinct medicine names used in the last 60 days, most recent first, each with the spelling and dose of
 * its latest use. Offered as chips in the "Diğer → İlaç" sheet.
 */
export async function recentMedicationNames(db: TrackerDb, now: number, limit = 5): Promise<RecentMedication[]> {
  const since = now - RECENT_MEDICATION_WINDOW_MS;
  const rows = await db.events.where('type').equals('medication').toArray();
  const medications = rows
    .filter((event): event is MedicationEvent => event.type === 'medication' && event.deletedAt === undefined && event.startAt >= since)
    .sort((a, b) => b.startAt - a.startAt);
  const seen = new Set<string>();
  const recent: RecentMedication[] = [];
  for (const medication of medications) {
    const name = medication.name.trim();
    const key = foldCase(name);
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    recent.push({ name, ...(medication.dose ? { dose: medication.dose } : {}) });
    if (recent.length === limit) break;
  }
  return recent;
}

/** Validates every draft (against stored running events and each other) and stores all or none. */
export async function logEvents(db: TrackerDb, drafts: readonly EventDraft[], now = Date.now()): Promise<TrackerEvent[]> {
  if (drafts.length === 0) return [];
  return db.transaction('rw', db.events, async () => {
    const running = await listRunningEvents(db);
    const groupId = drafts.length > 1 ? newId() : undefined;
    const created: TrackerEvent[] = [];
    const violations = new Set<RuleViolation>();
    const clashing: Id[] = []; // babies whose draft hit 'already-running', so the message can name them
    for (const draft of drafts) {
      const found = validateEvent(draft, [...running, ...created], now);
      for (const violation of found) violations.add(violation);
      if (found.includes('already-running') && draft.babyId !== null) clashing.push(draft.babyId);
      created.push({ ...draft, id: newId(), ...(groupId ? { groupId } : {}), createdAt: now, updatedAt: now } as TrackerEvent);
    }
    if (violations.size > 0) throw new ValidationError([...violations], clashing);
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

/** Stops a running timer. Returns false (and changes nothing) if it has already been stopped. */
export async function stopEvent(db: TrackerDb, id: Id, now = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (!isTimedType(event.type)) throw new Error(`Event ${id} is not a timer`);
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

/**
 * Replaces an entry's payload and timing with `draft`, keeping its id, group and creation time. The row is
 * written whole (a put, never an update), so a field the draft leaves out, such as a stool color after
 * "dirty" was turned off or an emptied note, is really gone. The type cannot change. A finished timer can
 * never run again, but a running one may be finished by an edit (a stop at a chosen time, fully validated).
 */
export async function updateEvent(db: TrackerDb, id: Id, draft: EventDraft, now = Date.now()): Promise<TrackerEvent> {
  return db.transaction('rw', db.events, async () => {
    const stored = await getLive(db, id);
    if (draft.type !== stored.type) throw new Error(`Event ${id} is a ${stored.type}, not a ${draft.type}`);
    if (!isOpen(stored) && isOpen(draft)) throw new Error(`Event ${id} has finished and cannot be restarted`);
    const violations = validateEvent(draft, await listRunningEvents(db), now, id);
    if (violations.length > 0) {
      const clashing = violations.includes('already-running') && draft.babyId !== null ? [draft.babyId] : [];
      throw new ValidationError(violations, clashing);
    }
    const updated = {
      ...draft,
      id,
      ...(stored.groupId === undefined ? {} : { groupId: stored.groupId }),
      createdAt: stored.createdAt,
      updatedAt: now,
    } as TrackerEvent;
    await db.events.put(updated);
    return updated;
  });
}

/** Soft-deletes an entry (the open-flag middleware takes a running one off the index). Deleting twice keeps the first time. */
export async function deleteEvent(db: TrackerDb, id: Id, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    const stored = await db.events.get(id);
    if (!stored) throw new Error(`Event ${id} not found`);
    if (stored.deletedAt !== undefined) return;
    await db.events.put({ ...stored, deletedAt: now, updatedAt: now });
  });
}
