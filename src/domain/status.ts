import { isOpen } from './rules';
import type { Id, Side, TrackerEvent } from './types';

export interface BabyStatus {
  lastFeed:
    | { at: number; kind: 'breastfeed'; side: Side }
    | { at: number; kind: 'bottle'; ml: number }
    | null;
  runningFeed: { eventId: Id; startAt: number; side: Side; segmentStart: number } | null;
  sleep: { state: 'asleep'; since: number; eventId: Id } | { state: 'awake'; since: number | null };
  lastDiaper: { at: number; wet: boolean; dirty: boolean } | null;
}

function latestBy<T>(items: readonly T[], key: (item: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) if (best === undefined || key(item) > key(best)) best = item;
  return best;
}

export function babyStatus(events: readonly TrackerEvent[], babyId: Id): BabyStatus {
  const mine = events.filter((e) => e.babyId === babyId && e.deletedAt === undefined);

  const feed = latestBy(
    mine.filter((e) => e.type === 'breastfeed' || e.type === 'bottle'),
    (e) => e.startAt,
  );
  let lastFeed: BabyStatus['lastFeed'] = null;
  if (feed?.type === 'breastfeed')
    lastFeed = { at: feed.startAt, kind: 'breastfeed', side: feed.segments.at(-1)!.side };
  else if (feed?.type === 'bottle') lastFeed = { at: feed.startAt, kind: 'bottle', ml: feed.ml };

  const openFeed = mine.find((e) => e.type === 'breastfeed' && isOpen(e));
  let runningFeed: BabyStatus['runningFeed'] = null;
  if (openFeed?.type === 'breastfeed') {
    const current = openFeed.segments.at(-1)!;
    runningFeed = {
      eventId: openFeed.id,
      startAt: openFeed.startAt,
      side: current.side,
      segmentStart: current.start,
    };
  }

  const openSleep = mine.find((e) => e.type === 'sleep' && isOpen(e));
  const lastSleep = latestBy(
    mine.filter((e) => e.type === 'sleep' && e.endAt !== undefined),
    (e) => e.endAt!,
  );
  const sleep: BabyStatus['sleep'] = openSleep
    ? { state: 'asleep', since: openSleep.startAt, eventId: openSleep.id }
    : { state: 'awake', since: lastSleep?.endAt ?? null };

  const diaper = latestBy(
    mine.filter((e) => e.type === 'diaper'),
    (e) => e.startAt,
  );
  const lastDiaper =
    diaper?.type === 'diaper' ? { at: diaper.startAt, wet: diaper.wet, dirty: diaper.dirty } : null;

  return { lastFeed, runningFeed, sleep, lastDiaper };
}
