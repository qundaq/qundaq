import type { BottleContents, Id, Side, TrackerEvent } from './types';

type Bottle = Extract<TrackerEvent, { type: 'bottle' }>;
type Feed = Extract<TrackerEvent, { type: 'breastfeed' }>;

function latest<T extends TrackerEvent>(
  events: readonly TrackerEvent[],
  babyId: Id,
  type: T['type'],
): T | null {
  let best: T | null = null;
  for (const event of events) {
    if (event.babyId !== babyId || event.type !== type || event.deletedAt !== undefined) continue;
    if (best === null || event.startAt > best.startAt) best = event as T;
  }
  return best;
}

/** The amount and contents of the baby's latest bottle: the bottle sheet starts from them. */
export function lastBottle(
  events: readonly TrackerEvent[],
  babyId: Id,
): { ml: number; contents: BottleContents } | null {
  const bottle = latest<Bottle>(events, babyId, 'bottle');
  return bottle ? { ml: bottle.ml, contents: bottle.contents } : null;
}

/** The side to offer next: the other one than the last side of the latest feed, left with no history. */
export function nextSide(events: readonly TrackerEvent[], babyId: Id): Side {
  const last = latest<Feed>(events, babyId, 'breastfeed')?.segments.at(-1)?.side;
  return last === 'L' ? 'R' : 'L';
}

/** When `side` was last used by the baby (the start of its latest segment), or null. */
export function lastSideUse(
  events: readonly TrackerEvent[],
  babyId: Id,
  side: Side,
): number | null {
  let best: number | null = null;
  for (const event of events) {
    if (event.babyId !== babyId || event.type !== 'breastfeed' || event.deletedAt !== undefined)
      continue;
    for (const segment of event.segments)
      if (segment.side === side && (best === null || segment.start > best)) best = segment.start;
  }
  return best;
}
