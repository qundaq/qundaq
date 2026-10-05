import { compareIds, newId } from '../domain/ids';
import {
  FUTURE_TOLERANCE_MS,
  ValidationError,
  isOpen,
  isTimedType,
  validateEvent,
  type RuleViolation,
} from '../domain/rules';
import { finishedPump } from '../domain/pump';
import { DAY } from '../domain/time';
import { foldCase } from '../domain/text';
import type {
  BreastSegment,
  EventDraft,
  GrowthEvent,
  Id,
  MedicationEvent,
  PumpSide,
  TrackerEvent,
} from '../domain/types';
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
  for (const event of [...running, ...recent])
    if (event.deletedAt === undefined) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.startAt - b.startAt || compareIds(a.id, b.id));
}

/**
 * How far before a window listEventsOverlapping looks for finished timers that reach into it. A finished
 * entry that began even earlier (a sleep longer than two days, which the duration rule refuses) is shown
 * only on the days inside this look-back.
 */
export const OVERLAP_LOOKBACK_MS = 2 * DAY;

function overlaps(event: TrackerEvent, from: number, to: number, now: number): boolean {
  const startsInside = event.startAt >= from && event.startAt < to;
  if (!isTimedType(event.type)) return startsInside;
  // A timer of no length (a pump logged with ml only) is a moment, like an instant entry.
  return startsInside || (event.startAt < to && (event.endAt ?? now) > from);
}

/**
 * Non-deleted events that overlap [from, to), oldest first. Instant entries count when they happen inside
 * the window; timers when any part of them does, a running one lasting until `now`.
 */
export async function listEventsOverlapping(
  db: TrackerDb,
  from: number,
  to: number,
  now: number,
): Promise<TrackerEvent[]> {
  const [candidates, running] = await Promise.all([
    db.events
      .where('startAt')
      .between(from - OVERLAP_LOOKBACK_MS, to, true, false)
      .toArray(),
    listRunningEvents(db),
  ]);
  const byId = new Map<Id, TrackerEvent>();
  for (const event of [...candidates, ...running]) {
    if (event.deletedAt === undefined && overlaps(event, from, to, now)) byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.startAt - b.startAt || compareIds(a.id, b.id));
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
  /** The latest use's startAt, for the Other list's medication caption (other.caption.medication). */
  at: number;
}

export const RECENT_MEDICATION_WINDOW_MS = 60 * DAY;

/**
 * Distinct medicine names used in the last 60 days, most recent first, each with the spelling, dose and
 * time of its latest use. Offered as chips in the Other → Medication sheet (other.chip.medication,
 * sheet.medication.title); the first one is the Other list's medication caption (other.caption.medication).
 */
export async function recentMedicationNames(
  db: TrackerDb,
  now: number,
  limit = 5,
): Promise<RecentMedication[]> {
  const since = now - RECENT_MEDICATION_WINDOW_MS;
  const rows = await db.events.where('type').equals('medication').toArray();
  const medications = rows
    .filter(
      (event): event is MedicationEvent =>
        event.type === 'medication' && event.deletedAt === undefined && event.startAt >= since,
    )
    .sort((a, b) => b.startAt - a.startAt);

  const seen = new Set<string>();
  const recent: RecentMedication[] = [];
  for (const medication of medications) {
    const name = medication.name.trim();
    const key = foldCase(name);
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    recent.push({
      name,
      ...(medication.dose ? { dose: medication.dose } : {}),
      at: medication.startAt,
    });
    if (recent.length === limit) break;
  }

  return recent;
}

/** A second "switch side" tap within this window is treated as the same tap. */
export const SWITCH_DEBOUNCE_MS = 2000;

/**
 * When the running side was opened by a switch, or null when it is still the feed's first side. Only a
 * switch starts the debounce window: the first tap after a feed starts always switches.
 */
export function lastSwitchAt(segments: readonly BreastSegment[]): number | null {
  return segments.length > 1 ? segments.at(-1)!.start : null;
}

/**
 * Until when a "switch side" tap is ignored (the window after the previous switch), or null when none
 * would be. The buttons that switch read it too, so they rest exactly while a tap would do nothing.
 */
export function switchRestsUntil(segments: readonly BreastSegment[]): number | null {
  const switchedAt = lastSwitchAt(segments);
  return switchedAt === null ? null : switchedAt + SWITCH_DEBOUNCE_MS;
}

function closeLast(segments: readonly BreastSegment[], at: number): BreastSegment[] {
  return segments.map((segment, i) =>
    i === segments.length - 1 && segment.end === undefined
      ? { ...segment, end: Math.max(at, segment.start) }
      : segment,
  );
}

/**
 * The running event ended at `now` (never before it started), with its last breastfeeding segment closed,
 * or a pump's elapsed minutes recorded on its side.
 */
export function stoppedAt(event: TrackerEvent, now: number): TrackerEvent {
  const endAt = Math.max(now, event.startAt);
  if (event.type === 'pump') return { ...finishedPump(event, endAt), updatedAt: now };
  return {
    ...event,
    endAt,
    updatedAt: now,
    ...(event.type === 'breastfeed' ? { segments: closeLast(event.segments, endAt) } : {}),
  };
}

/** One write's effect on one row; `before` is null for a row the write created. Undo hands these to restoreEvents. */
export interface EventChange {
  before: TrackerEvent | null;
  after: TrackerEvent;
}

export interface RecordOptions {
  /**
   * Stops each drafted baby's other running timer (a sleep for a new feed, a feed for a new sleep) at the new
   * timer's start, in the same transaction. A new start earlier than that timer's start or its current side's
   * start is refused with 'running-overlap'.
   */
  endRunning?: boolean;
}

/** The earliest moment a running timer can end: its start, or the start of its current side. */
function stopFloor(event: TrackerEvent): number {
  if (event.type !== 'breastfeed') return event.startAt;
  return Math.max(event.startAt, event.segments.at(-1)?.start ?? event.startAt);
}

/**
 * Validates every draft (against running timers and each other) and stores all or none. Returns what changed:
 * the timers it stopped (with endRunning) first, then the rows it created.
 */
export async function recordEvents(
  db: TrackerDb,
  drafts: readonly EventDraft[],
  now = Date.now(),
  options: RecordOptions = {},
): Promise<EventChange[]> {
  if (drafts.length === 0) return [];
  return db.transaction('rw', db.events, async () => {
    let running = await listRunningEvents(db);
    const stops: EventChange[] = [];
    const overlapping = new Set<Id>();
    if (options.endRunning) {
      for (const draft of drafts) {
        if (!isOpen(draft) || draft.babyId === null) continue;
        for (const other of running) {
          if (other.babyId !== draft.babyId || other.type === draft.type || !isOpen(other))
            continue;
          if (draft.startAt < stopFloor(other)) {
            overlapping.add(draft.babyId);
            continue;
          }
          const after = { ...stoppedAt(other, draft.startAt), updatedAt: now };
          stops.push({ before: other, after });
          running = running.map((event) => (event.id === other.id ? after : event));
        }
      }
    }
    if (overlapping.size > 0) throw new ValidationError(['running-overlap'], [...overlapping]);

    const groupId = drafts.length > 1 ? newId() : undefined;
    const created: TrackerEvent[] = [];
    const violations = new Set<RuleViolation>();
    const clashing: Id[] = []; // babies whose draft hit 'already-running', so the message can name them

    for (const draft of drafts) {
      const found = validateEvent(draft, [...running, ...created], now);
      for (const violation of found) violations.add(violation);
      if (found.includes('already-running') && draft.babyId !== null) clashing.push(draft.babyId);
      created.push({
        ...draft,
        id: newId(),
        ...(groupId ? { groupId } : {}),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (violations.size > 0) throw new ValidationError([...violations], clashing);
    if (stops.length > 0) await db.events.bulkPut(stops.map((stop) => stop.after));
    await db.events.bulkAdd(created);
    return [...stops, ...created.map((after) => ({ before: null, after }))];
  });
}

/** Validates every draft (against stored running events and each other) and stores all or none. */
export async function logEvents(
  db: TrackerDb,
  drafts: readonly EventDraft[],
  now = Date.now(),
): Promise<TrackerEvent[]> {
  return (await recordEvents(db, drafts, now)).map((change) => change.after);
}

async function getLive(db: TrackerDb, id: Id): Promise<TrackerEvent> {
  const event = await db.events.get(id);
  if (!event || event.deletedAt !== undefined) throw new Error(`Event ${id} not found`);
  return event;
}

/**
 * Stops a running timer and returns the change for undo; null (nothing changed) if it has already been
 * stopped. Without `at` it ends now. With `at` (the sheet's "End", edit.end), it ends then: never before
 * the timer or its current side began, never in the future.
 */
export async function stopTimer(
  db: TrackerDb,
  id: Id,
  now = Date.now(),
  at?: number,
): Promise<EventChange | null> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (!isTimedType(event.type)) throw new Error(`Event ${id} is not a timer`);
    if (!isOpen(event)) return null;
    if (at !== undefined && at < stopFloor(event)) throw new ValidationError(['end-before-start']);
    if (at !== undefined && at > now + FUTURE_TOLERANCE_MS)
      throw new ValidationError(['in-future']);
    const after = { ...stoppedAt(event, at ?? now), updatedAt: now };
    await db.events.put(after);
    return { before: event, after };
  });
}

/** Stops a running timer. Returns false (and changes nothing) if it has already been stopped. */
export async function stopEvent(db: TrackerDb, id: Id, now = Date.now()): Promise<boolean> {
  return (await stopTimer(db, id, now)) !== null;
}

/**
 * Starts the parent's pump timer at `now` on `side` ('B': both breasts at once). One pump runs at a time,
 * as one timer per baby: a pump still running ends at `now` (its minutes recorded) in the same write.
 * Returns what changed for undo: the stopped pump first, then the new one.
 */
export async function startPump(
  db: TrackerDb,
  side: PumpSide,
  now = Date.now(),
): Promise<EventChange[]> {
  return db.transaction('rw', db.events, async () => {
    const stops = (await listRunningEvents(db))
      .filter((event) => event.type === 'pump' && event.deletedAt === undefined)
      .map((before) => ({ before, after: stoppedAt(before, now) }));
    if (stops.length > 0) await db.events.bulkPut(stops.map((stop) => stop.after));
    const created = await recordEvents(
      db,
      [{ type: 'pump', babyId: null, startAt: now, side }],
      now,
    );
    return [...stops, ...created];
  });
}

const PUMP_PATCH_KEYS = ['minLeft', 'minRight', 'mlLeft', 'mlRight'] as const;

/** Corrections made in the stop sheet before finishing: a number sets the field, null removes it. */
export type PumpPatch = Partial<Record<(typeof PUMP_PATCH_KEYS)[number], number | null>>;

/**
 * Finishes a running pump at `now`: the elapsed minutes (rounded, 1 to MAX_PUMP_MIN) go on the side it ran
 * on, both for 'B', the side is dropped, then `patch` is applied. The result must pass the pumping rules
 * (a ValidationError otherwise, and nothing changes); like stopTimer, a stop is never refused for having
 * run too long. Returns the change for undo, or null if the pump has already finished.
 */
export async function stopPump(
  db: TrackerDb,
  id: Id,
  now = Date.now(),
  patch: PumpPatch = {},
): Promise<EventChange | null> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (event.type !== 'pump') throw new Error(`Event ${id} is not a pump`);
    if (!isOpen(event)) return null;
    const finished = { ...stoppedAt(event, now) } as typeof event;
    for (const key of PUMP_PATCH_KEYS) {
      const value = patch[key];
      if (value === null) delete finished[key];
      else if (value !== undefined) finished[key] = value;
    }
    const violations = validateEvent(finished, [], now, id).filter(
      (violation) => violation !== 'too-long',
    );
    if (violations.length > 0) throw new ValidationError(violations);
    await db.events.put(finished);
    return { before: event, after: finished };
  });
}

/**
 * Undoes one write, all or nothing: a row it created is soft-deleted; a row it stopped runs again, provided
 * it is still exactly as the write left it (same updatedAt) and no other timer of that baby runs now.
 * Otherwise nothing changes and the result is false. Restored rows get a fresh updatedAt, so a later merge
 * sees the undo as the newest change.
 */
export async function restoreEvents(
  db: TrackerDb,
  changes: readonly EventChange[],
  now = Date.now(),
): Promise<boolean> {
  return db.transaction('rw', db.events, async () => {
    const ids = changes.map((change) => change.after.id);
    const stored = await db.events.bulkGet(ids);
    const writes: TrackerEvent[] = [];
    const reopened: TrackerEvent[] = [];
    for (const [i, change] of changes.entries()) {
      const row = stored[i];
      if (change.before === null) {
        if (row && row.deletedAt === undefined)
          writes.push({ ...row, deletedAt: now, updatedAt: now });
        continue;
      }
      if (!row || row.deletedAt !== undefined || row.updatedAt !== change.after.updatedAt)
        return false;
      reopened.push({ ...change.before, updatedAt: now });
    }
    const touched = new Set(ids);
    const others = (await listRunningEvents(db)).filter((event) => !touched.has(event.id));
    for (const row of reopened) {
      const peers = reopened.filter((other) => other !== row);
      if (validateEvent(row, [...others, ...peers], now, row.id).includes('already-running'))
        return false;
    }
    await db.events.bulkPut([...writes, ...reopened]);
    return true;
  });
}

/**
 * Closes the current side and opens the other. Returns false (and changes nothing) if the feed has
 * already finished, or if the previous switch was less than SWITCH_DEBOUNCE_MS ago (the second tap of a
 * double tap). The first switch of a feed is never ignored, however soon after the start it comes.
 */
export async function switchBreastSide(db: TrackerDb, id: Id, now = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.events, async () => {
    const event = await getLive(db, id);
    if (event.type !== 'breastfeed') throw new Error(`Event ${id} is not a breastfeed`);
    if (!isOpen(event)) return false;
    const current = event.segments.at(-1)!;
    const restsUntil = switchRestsUntil(event.segments);
    if (restsUntil !== null && now < restsUntil) return false;
    const segments: BreastSegment[] = [
      ...closeLast(event.segments, now),
      { side: current.side === 'L' ? 'R' : 'L', start: now },
    ];
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
export async function updateEvent(
  db: TrackerDb,
  id: Id,
  draft: EventDraft,
  now = Date.now(),
): Promise<TrackerEvent> {
  return db.transaction('rw', db.events, async () => {
    const stored = await getLive(db, id);
    if (draft.type !== stored.type)
      throw new Error(`Event ${id} is a ${stored.type}, not a ${draft.type}`);
    if (!isOpen(stored) && isOpen(draft))
      throw new Error(`Event ${id} has finished and cannot be restarted`);

    const violations = validateEvent(draft, await listRunningEvents(db), now, id);
    if (violations.length > 0) {
      const clashing =
        violations.includes('already-running') && draft.babyId !== null ? [draft.babyId] : [];
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

/** Whether any entry is not deleted, for Home's backup reminder. Stops at the first live row. */
export async function hasLiveEvents(db: TrackerDb): Promise<boolean> {
  return (await db.events.filter((event) => event.deletedAt === undefined).first()) !== undefined;
}
