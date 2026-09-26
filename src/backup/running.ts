import { FORGOTTEN_AFTER_MS } from '../domain/health';
import { isOpen } from '../domain/rules';
import type { Baby, Id, TrackerEvent } from '../domain/types';

export type TimerType = 'sleep' | 'breastfeed';

/** collision: another timer of the type runs for the baby. stale: the user chose to stop it. deleted-baby: its baby is deleted. */
export type StopReason = 'collision' | 'stale' | 'deleted-baby';

export interface StoppedTimer {
  id: Id;
  babyId: Id | null;
  type: TimerType;
  startAt: number;
  stopAt: number;
  reason: StopReason;
}

/** A running timer from the file that has probably been forgotten, listed in the preview. */
export interface StaleTimer {
  id: Id;
  babyId: Id | null;
  type: TimerType;
  startAt: number;
}

// The device's own rows were never validated, so everything here tolerates a malformed row (a
// breastfeed whose `segments` is not a list, say): it may be stopped, but it is never guessed at, and
// nothing here throws on it.

function isRunning(event: TrackerEvent): event is Extract<TrackerEvent, { type: TimerType }> {
  return event.deletedAt === undefined && isOpen(event) && Number.isFinite(event.startAt);
}

function segmentsOf(event: TrackerEvent): unknown[] | null {
  return event.type === 'breastfeed' && Array.isArray(event.segments) ? event.segments : null;
}

function lastSideStart(event: TrackerEvent): number {
  const last = segmentsOf(event)?.at(-1) as { start?: unknown } | undefined;
  const start = last?.start;
  return typeof start === 'number' && Number.isFinite(start) ? start : event.startAt;
}

/**
 * The running timer ended at `at`, but never before it started or before its current side started (so a
 * side never ends before it begins). The last breastfeeding side is closed at the same time.
 */
export function stopTimerAt(event: TrackerEvent, at: number, now: number): TrackerEvent {
  const endAt = Math.max(at, event.startAt, lastSideStart(event));
  const segments = segmentsOf(event);
  if (segments === null) return { ...event, endAt, updatedAt: now };
  const last = segments.length - 1;
  const closed = segments.map((segment, i) =>
    i === last && typeof segment === 'object' && segment !== null && (segment as { end?: unknown }).end === undefined
      ? { ...segment, end: endAt }
      : segment,
  );
  return { ...event, endAt, segments: closed, updatedAt: now } as TrackerEvent;
}

/**
 * Running timers whose winning copy came from the file (`fromFile`) and that were probably forgotten: they
 * started before the device's newest entry of that type for that baby, or the backup is older than the
 * "forgot to stop?" limit for the type. Restored as they are, they would block every new timer.
 */
export function findStale(
  merged: Iterable<TrackerEvent>,
  fromFile: ReadonlySet<Id>,
  device: readonly TrackerEvent[],
  exportedAt: number,
  now: number,
): StaleTimer[] {
  const stale: StaleTimer[] = [];
  for (const event of merged) {
    if (!fromFile.has(event.id) || !isRunning(event)) continue;
    const newerOnDevice = device.some(
      (other) =>
        other.id !== event.id &&
        other.deletedAt === undefined &&
        other.babyId === event.babyId &&
        other.type === event.type &&
        other.startAt > event.startAt,
    );
    if (newerOnDevice || now - exportedAt > FORGOTTEN_AFTER_MS[event.type]) {
      stale.push({ id: event.id, babyId: event.babyId, type: event.type, startAt: event.startAt });
    }
  }
  return stale;
}

export interface RepairContext {
  exportedAt: number;
  now: number;
  /** Stale timers the user chose to stop at the moment of the backup. */
  stopStale: ReadonlySet<Id>;
}

/**
 * Makes the merged rows obey "at most one running sleep and one running breastfeed per baby", and stops
 * what must not run on:
 * 1. stale timers the user chose to stop end at the backup's time;
 * 2. timers of a deleted baby end when the baby was deleted (as deleteBaby does);
 * 3. of two or more running timers of one type for one baby, the one that started last keeps running (a
 *    tie goes to the larger id, so both phones agree) and every other one ends when it started.
 * Returns the rows it changed and what it stopped, for the preview.
 */
export function repairRunning(
  rows: Iterable<TrackerEvent>,
  babies: ReadonlyMap<Id, Baby>,
  context: RepairContext,
): { changed: TrackerEvent[]; stopped: StoppedTimer[] } {
  const current = new Map<Id, TrackerEvent>();
  for (const row of rows) current.set(row.id, row);
  const changed = new Map<Id, TrackerEvent>();
  const stopped: StoppedTimer[] = [];
  const stop = (event: Extract<TrackerEvent, { type: TimerType }>, at: number, reason: StopReason) => {
    // Never in the future, even when the backup came from a phone whose clock ran ahead.
    let next = stopTimerAt(event, Math.min(at, context.now), context.now);
    // A stale stop records only what the backup knew. Stamped with the backup's time, not now, so a real
    // stop made after the backup on the other phone still wins a later merge.
    if (reason === 'stale') next = { ...next, updatedAt: Math.min(context.now, Math.max(event.updatedAt + 1, context.exportedAt)) };
    current.set(event.id, next);
    changed.set(event.id, next);
    stopped.push({ id: event.id, babyId: event.babyId, type: event.type, startAt: event.startAt, stopAt: next.endAt!, reason });
  };

  for (const id of context.stopStale) {
    const event = current.get(id);
    if (event && isRunning(event)) stop(event, context.exportedAt, 'stale');
  }

  for (const event of [...current.values()]) {
    if (!isRunning(event) || event.babyId === null) continue;
    const deletedAt = babies.get(event.babyId)?.deletedAt;
    if (deletedAt !== undefined) stop(event, deletedAt, 'deleted-baby');
  }

  const groups = new Map<string, Extract<TrackerEvent, { type: TimerType }>[]>();
  for (const event of current.values()) {
    if (!isRunning(event)) continue;
    const key = `${event.babyId}\u0000${event.type}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const newest = group.reduce((best, event) =>
      event.startAt > best.startAt || (event.startAt === best.startAt && event.id > best.id) ? event : best,
    );
    for (const event of group) if (event !== newest) stop(event, newest.startAt, 'collision');
  }
  return { changed: [...changed.values()], stopped };
}
