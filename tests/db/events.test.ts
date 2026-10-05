import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import {
  SWITCH_DEBOUNCE_MS,
  deleteEvent,
  hasLiveEvents,
  lastSwitchAt,
  listEventsOverlapping,
  listRecentEvents,
  listRunningEvents,
  logEvents,
  stopEvent,
  switchBreastSide,
  switchRestsUntil,
} from '../../src/db/events';
import { ValidationError } from '../../src/domain/rules';
import { DAY, HOUR, MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();
const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

describe('logEvents', () => {
  it('stores a single event without a group', async () => {
    const db = freshDb();
    const [diaper] = await logEvents(
      db,
      [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }],
      NOW,
    );
    expect(diaper).toMatchObject({ type: 'diaper', babyId: 'a', createdAt: NOW, updatedAt: NOW });
    expect(diaper!.groupId).toBeUndefined();
    expect(await listRecentEvents(db, NOW - DAY)).toEqual([diaper]);
  });

  it('links events logged together with a shared groupId', async () => {
    const db = freshDb();
    const created = await logEvents(
      db,
      [
        { type: 'bottle', babyId: 'a', startAt: NOW, ml: 90, contents: 'formula' },
        { type: 'bottle', babyId: 'b', startAt: NOW, ml: 90, contents: 'formula' },
      ],
      NOW,
    );
    expect(created).toHaveLength(2);
    expect(created[0]!.groupId).toBeDefined();
    expect(created[0]!.groupId).toBe(created[1]!.groupId);
  });

  it('rejects the whole batch if any draft breaks a rule', async () => {
    const db = freshDb();
    await logEvents(db, [{ type: 'sleep', babyId: 'a', startAt: NOW - 30 * MINUTE }], NOW);
    await expect(
      logEvents(
        db,
        [
          { type: 'sleep', babyId: 'b', startAt: NOW },
          { type: 'sleep', babyId: 'a', startAt: NOW },
        ],
        NOW,
      ),
    ).rejects.toEqual(new ValidationError(['already-running'], ['a']));
    expect(await db.events.count()).toBe(1);
  });

  it('also checks drafts against each other', async () => {
    const db = freshDb();
    await expect(
      logEvents(
        db,
        [
          { type: 'sleep', babyId: 'a', startAt: NOW },
          { type: 'sleep', babyId: 'a', startAt: NOW },
        ],
        NOW,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('names every baby whose draft clashes with a running entry', async () => {
    const db = freshDb();
    await logEvents(
      db,
      [
        { type: 'sleep', babyId: 'a', startAt: NOW - 30 * MINUTE },
        { type: 'sleep', babyId: 'b', startAt: NOW - 20 * MINUTE },
      ],
      NOW,
    );
    await expect(
      logEvents(
        db,
        [
          { type: 'sleep', babyId: 'a', startAt: NOW },
          { type: 'sleep', babyId: 'b', startAt: NOW },
          { type: 'sleep', babyId: 'c', startAt: NOW },
        ],
        NOW,
      ),
    ).rejects.toMatchObject({ violations: ['already-running'], babyIds: ['a', 'b'] });
  });

  it('refuses a finished feed longer than 4 hours', async () => {
    const db = freshDb();
    const start = NOW - 5 * HOUR;
    await expect(
      logEvents(
        db,
        [
          {
            type: 'breastfeed',
            babyId: 'a',
            startAt: start,
            endAt: NOW,
            segments: [{ side: 'L', start, end: NOW }],
          },
        ],
        NOW,
      ),
    ).rejects.toMatchObject({ violations: ['too-long'] });
  });
});

describe('listRecentEvents', () => {
  it('returns recent and still-running events, without deleted or old finished ones', async () => {
    const db = freshDb();
    const [oldRunning, oldDone, recent, deleted] = await logEvents(
      db,
      [
        { type: 'sleep', babyId: 'a', startAt: NOW - 3 * DAY },
        { type: 'sleep', babyId: 'b', startAt: NOW - 3 * DAY, endAt: NOW - 3 * DAY + 60 * MINUTE },
        { type: 'diaper', babyId: 'a', startAt: NOW - 60 * MINUTE, wet: true, dirty: false },
        { type: 'diaper', babyId: 'a', startAt: NOW - 30 * MINUTE, wet: true, dirty: false },
      ],
      NOW,
    );
    await db.events.put({ ...deleted!, deletedAt: NOW });
    const ids = (await listRecentEvents(db, NOW - DAY)).map((e) => e.id);
    expect(ids).toEqual([oldRunning!.id, recent!.id]);
    expect(ids).not.toContain(oldDone!.id);
  });
});

describe('timers', () => {
  it('stopEvent ends a running sleep', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 40 * MINUTE }],
      NOW - 40 * MINUTE,
    );
    await stopEvent(db, sleep!.id, NOW);
    expect(await db.events.get(sleep!.id)).toMatchObject({ endAt: NOW, updatedAt: NOW });
  });

  it('stopEvent closes the open breastfeeding segment', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }],
      start,
    );
    await stopEvent(db, feed!.id, NOW);
    expect(await db.events.get(feed!.id)).toMatchObject({
      endAt: NOW,
      segments: [{ side: 'L', start, end: NOW }],
    });
  });

  it('switchBreastSide closes the current side and opens the other', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }],
      start,
    );
    await switchBreastSide(db, feed!.id, NOW);
    const stored = await db.events.get(feed!.id);
    expect(stored).toMatchObject({
      segments: [
        { side: 'L', start, end: NOW },
        { side: 'R', start: NOW },
      ],
      updatedAt: NOW,
    });
    expect(stored!.endAt).toBeUndefined();
  });

  it('stopEvent reports true when it stopped the event', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 40 * MINUTE }],
      NOW - 40 * MINUTE,
    );
    expect(await stopEvent(db, sleep!.id, NOW)).toBe(true);
  });

  it('stopping an already finished event is a no-op (double tap on the "end breastfeed"/"woke up" button, timer.stopFeed/timer.wakeUp)', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 40 * MINUTE }],
      NOW - 40 * MINUTE,
    );
    expect(await stopEvent(db, sleep!.id, NOW)).toBe(true);
    expect(await stopEvent(db, sleep!.id, NOW + 5000)).toBe(false);
    expect(await db.events.get(sleep!.id)).toMatchObject({ endAt: NOW, updatedAt: NOW });
  });

  it('stopEvent still refuses a missing or deleted event', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 40 * MINUTE }],
      NOW - 40 * MINUTE,
    );
    await db.events.put({ ...sleep!, deletedAt: NOW });
    await expect(stopEvent(db, sleep!.id, NOW)).rejects.toThrow(/not found/);
    await expect(stopEvent(db, 'missing', NOW)).rejects.toThrow(/not found/);
  });

  it('switchBreastSide reports true when it switched', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }],
      start,
    );
    expect(await switchBreastSide(db, feed!.id, NOW)).toBe(true);
  });

  it('a second switch within SWITCH_DEBOUNCE_MS is ignored (double tap on the "switch side" button, timer.switchSide)', async () => {
    expect(SWITCH_DEBOUNCE_MS).toBe(2000);
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }],
      start,
    );
    expect(await switchBreastSide(db, feed!.id, NOW)).toBe(true);
    expect(await switchBreastSide(db, feed!.id, NOW + SWITCH_DEBOUNCE_MS - 1)).toBe(false);
    expect(await db.events.get(feed!.id)).toMatchObject({
      segments: [
        { side: 'L', start, end: NOW },
        { side: 'R', start: NOW },
      ],
      updatedAt: NOW,
    });
    expect(await switchBreastSide(db, feed!.id, NOW + SWITCH_DEBOUNCE_MS)).toBe(true);
    expect(await db.events.get(feed!.id)).toMatchObject({
      segments: [
        { side: 'L', start, end: NOW },
        { side: 'R', start: NOW, end: NOW + SWITCH_DEBOUNCE_MS },
        { side: 'L', start: NOW + SWITCH_DEBOUNCE_MS },
      ],
    });
  });

  it('the first switch right after a feed starts always switches; only a second tap is ignored', async () => {
    const db = freshDb();
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: NOW, segments: [{ side: 'L', start: NOW }] }],
      NOW,
    );
    // A tap one second after the start: before the fix this fell inside the window and did nothing.
    expect(await switchBreastSide(db, feed!.id, NOW + 1000)).toBe(true);
    expect(await switchBreastSide(db, feed!.id, NOW + 1500)).toBe(false);
    expect(await db.events.get(feed!.id)).toMatchObject({
      segments: [
        { side: 'L', start: NOW, end: NOW + 1000 },
        { side: 'R', start: NOW + 1000 },
      ],
    });
  });

  it('lastSwitchAt is the start of a side opened by a switch, never of the first side', () => {
    expect(lastSwitchAt([{ side: 'L', start: NOW }])).toBeNull();
    expect(
      lastSwitchAt([
        { side: 'L', start: NOW, end: NOW + 5 },
        { side: 'R', start: NOW + 5 },
      ]),
    ).toBe(NOW + 5);
  });

  it('switchRestsUntil ends the window SWITCH_DEBOUNCE_MS after a switch, exactly when a switch works again', async () => {
    expect(switchRestsUntil([{ side: 'L', start: NOW }])).toBeNull();
    const db = freshDb();
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: NOW, segments: [{ side: 'L', start: NOW }] }],
      NOW,
    );
    expect(await switchBreastSide(db, feed!.id, NOW + 1000)).toBe(true);
    const stored = await db.events.get(feed!.id);
    const until = switchRestsUntil(stored!.type === 'breastfeed' ? stored!.segments : []);
    expect(until).toBe(NOW + 1000 + SWITCH_DEBOUNCE_MS);
    expect(await switchBreastSide(db, feed!.id, until! - 1)).toBe(false);
    expect(await switchBreastSide(db, feed!.id, until!)).toBe(true);
  });

  it('switching a finished feed is a no-op', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }],
      start,
    );
    await stopEvent(db, feed!.id, NOW);
    expect(await switchBreastSide(db, feed!.id, NOW + 10_000)).toBe(false);
    expect(await db.events.get(feed!.id)).toMatchObject({
      endAt: NOW,
      segments: [{ side: 'L', start, end: NOW }],
    });
  });

  it('switchBreastSide still refuses a missing, deleted or non-breastfeed event', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    // Two babies: a running sleep and a running feed for the same baby is refused since Plan 8 §6.3.
    const [feed, sleep] = await logEvents(
      db,
      [
        { type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] },
        { type: 'sleep', babyId: 'b', startAt: start },
      ],
      start,
    );
    await db.events.put({ ...feed!, deletedAt: NOW });
    await expect(switchBreastSide(db, feed!.id, NOW)).rejects.toThrow(/not found/);
    await expect(switchBreastSide(db, 'missing', NOW)).rejects.toThrow(/not found/);
    await expect(switchBreastSide(db, sleep!.id, NOW)).rejects.toThrow(/not a breastfeed/);
  });
});

describe('running events', () => {
  it('logEvents, switchBreastSide and stopEvent keep exactly the running rows in the open index', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [sleep, feed] = await logEvents(
      db,
      [
        { type: 'sleep', babyId: 'a', startAt: start },
        { type: 'breastfeed', babyId: 'b', startAt: start, segments: [{ side: 'L', start }] },
        { type: 'diaper', babyId: 'a', startAt: start, wet: true, dirty: false },
      ],
      start,
    );
    const runningIds = async () => (await listRunningEvents(db)).map((event) => event.id).sort();
    expect(await runningIds()).toEqual([sleep!.id, feed!.id].sort());

    await switchBreastSide(db, feed!.id, NOW);
    expect(await runningIds()).toEqual([sleep!.id, feed!.id].sort());

    await stopEvent(db, sleep!.id, NOW);
    expect(await runningIds()).toEqual([feed!.id]);

    await stopEvent(db, feed!.id, NOW);
    expect(await runningIds()).toEqual([]);
  });

  it('stopEvent refuses an entry that is not a timer', async () => {
    const db = freshDb();
    const [diaper] = await logEvents(
      db,
      [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }],
      NOW,
    );
    await expect(stopEvent(db, diaper!.id, NOW)).rejects.toThrow(
      `Event ${diaper!.id} is not a timer`,
    );
  });
});

describe('hasLiveEvents', () => {
  it('is true only while an entry that is not deleted exists', async () => {
    const db = freshDb();
    expect(await hasLiveEvents(db)).toBe(false);
    const [diaper] = await logEvents(
      db,
      [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }],
      NOW,
    );
    expect(await hasLiveEvents(db)).toBe(true);
    await deleteEvent(db, diaper!.id, NOW);
    expect(await hasLiveEvents(db)).toBe(false);
  });
});

describe('listRecentEvents — same-instant ties', () => {
  it('a running event and a finished event at the same instant sort by id, not merge order', async () => {
    const db = freshDb();
    // Fixed ids, deliberately contradicting the merge order: listRecentEvents iterates `running` (the
    // open index) before `recent` (the startAt-indexed query). The running event is also captured by
    // `recent` (its startAt satisfies it too), but a Map keeps a key's *first* insertion position, so
    // without the tie-break the running event always ends up first, however its id compares to the
    // finished one's. Naming the running event 'z-running' (sorts after 'a-finished') makes that wrong,
    // merge-order-driven result observably differ from the correct, id-ascending one.
    const running: TrackerEvent = {
      id: 'z-running',
      type: 'sleep',
      babyId: 'a',
      startAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const finished: TrackerEvent = {
      id: 'a-finished',
      type: 'diaper',
      babyId: 'b',
      startAt: NOW,
      wet: true,
      dirty: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.events.add(running);
    await db.events.add(finished);

    const order = (await listRecentEvents(db, NOW - DAY)).map((e) => e.id);
    expect(order).toEqual(['a-finished', 'z-running']);
  });
});

describe('listEventsOverlapping — same-instant ties', () => {
  it('two overlapping events at the same instant sort by id, not merge order', async () => {
    const db = freshDb();
    // Fixed, deliberately-contradicting ids: 'z-event' is stored first, 'a-event' second, so anything
    // that fell back to insertion order (rather than id order) would list 'z-event' first.
    //
    // Note: unlike listRecentEvents, this cannot be forced to fail by id choice alone. Both events here
    // share a startAt inside the query window, so both are found by the same single `startAt`-indexed
    // "candidates" query, and fake-indexeddb (like the IndexedDB spec) already returns duplicate index
    // keys from a single query in primary-key (id) order — before listEventsOverlapping's own sort ever
    // runs. The only way to reach the `running` index at all is a startAt *outside* the candidates
    // window, but then no second event can share that exact startAt and still appear in the results (it
    // would need to be in `candidates` too, which requires being inside the window). So this test is kept
    // as a real integration test of the full overlap contract; it does not by itself prove the compareIds
    // tie-break is exercised — see the revert-and-rerun note in the fix report.
    const first: TrackerEvent = {
      id: 'z-event',
      type: 'diaper',
      babyId: 'a',
      startAt: NOW,
      wet: true,
      dirty: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const second: TrackerEvent = {
      id: 'a-event',
      type: 'diaper',
      babyId: 'b',
      startAt: NOW,
      wet: true,
      dirty: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.events.add(first);
    await db.events.add(second);

    const order = (await listEventsOverlapping(db, NOW - HOUR, NOW + HOUR, NOW)).map((e) => e.id);
    expect(order).toEqual(['a-event', 'z-event']);
  });
});
