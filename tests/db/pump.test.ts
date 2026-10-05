import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import {
  deleteEvent,
  listRunningEvents,
  logEvents,
  recordEvents,
  restoreEvents,
  startPump,
  stopPump,
  stopTimer,
} from '../../src/db/events';
import { MAX_PUMP_MIN, TEXT_LIMITS, ValidationError } from '../../src/domain/rules';
import type { TrackerEvent } from '../../src/domain/types';
import { HOUR, MINUTE } from '../../src/domain/time';

const NOW = new Date(2026, 9, 5, 9, 0).getTime();
const SECOND = 1000;
const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

const runningIds = async (db: TrackerDb) =>
  (await listRunningEvents(db)).map((event) => event.id).sort();

describe('startPump', () => {
  it("starts the parent's running pump on a side and returns the created row", async () => {
    const db = freshDb();
    const changes = await startPump(db, 'B', NOW);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.before).toBeNull();
    expect(changes[0]!.after).toMatchObject({
      type: 'pump',
      babyId: null,
      startAt: NOW,
      side: 'B',
      createdAt: NOW,
    });
    expect(changes[0]!.after.endAt).toBeUndefined();
    expect(await runningIds(db)).toEqual([changes[0]!.after.id]);
  });

  it('a second start ends the running pump at its start, in the same write', async () => {
    const db = freshDb();
    const [first] = await startPump(db, 'L', NOW - 20 * MINUTE);
    const changes = await startPump(db, 'R', NOW);
    expect(changes.map((c) => [c.before?.id ?? null, c.after.endAt ?? null])).toEqual([
      [first!.after.id, NOW],
      [null, null],
    ]);
    expect(changes[0]!.after).toMatchObject({ minLeft: 20, updatedAt: NOW });
    expect(changes[0]!.after).not.toHaveProperty('side');
    expect(await runningIds(db)).toEqual([changes[1]!.after.id]);
  });

  it("leaves the babies' timers alone, and theirs leave the pump alone", async () => {
    const db = freshDb();
    const [asleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - HOUR }],
      NOW,
    );
    const [pump] = await startPump(db, 'L', NOW - 10 * MINUTE);
    const changes = await recordEvents(
      db,
      [{ type: 'breastfeed', babyId: 'a', startAt: NOW, segments: [{ side: 'L', start: NOW }] }],
      NOW,
      { endRunning: true },
    );
    expect(changes.map((c) => c.before?.id ?? null)).toEqual([asleep!.id, null]);
    expect(await runningIds(db)).toEqual([pump!.after.id, changes[1]!.after.id].sort());
  });

  it('a start that is refused (a side it does not know) leaves the running pump running', async () => {
    const db = freshDb();
    const [first] = await startPump(db, 'L', NOW - 20 * MINUTE);
    await expect(startPump(db, 'X' as never, NOW)).rejects.toEqual(
      new ValidationError(['pump-invalid']),
    );
    expect(await runningIds(db)).toEqual([first!.after.id]);
    const stored = await db.events.get(first!.after.id);
    expect(stored).toMatchObject({ side: 'L', updatedAt: NOW - 20 * MINUTE });
    expect(stored!.endAt).toBeUndefined();
  });

  it('undo removes the new pump and lets the one it ended run again', async () => {
    const db = freshDb();
    const [first] = await startPump(db, 'L', NOW - 20 * MINUTE);
    const changes = await startPump(db, 'R', NOW);
    expect(await restoreEvents(db, changes, NOW + MINUTE)).toBe(true);
    expect(await runningIds(db)).toEqual([first!.after.id]);
    expect(await db.events.get(first!.after.id)).toMatchObject({ side: 'L' });
    expect(await db.events.get(first!.after.id)).not.toHaveProperty('minLeft');
    expect(await db.events.get(changes[1]!.after.id)).toMatchObject({ deletedAt: NOW + MINUTE });
  });
});

describe('stopPump', () => {
  it('records the elapsed minutes, rounded, on the side it ran on, and clears the side', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'R', NOW - 12 * MINUTE - 29 * SECOND);
    const change = await stopPump(db, started!.after.id, NOW);
    expect(change!.before).toMatchObject({ side: 'R' });
    expect(change!.after).toMatchObject({ endAt: NOW, minRight: 12, updatedAt: NOW });
    expect(change!.after).not.toHaveProperty('side');
    expect(change!.after).not.toHaveProperty('minLeft');
    expect(await runningIds(db)).toEqual([]);
    expect(await stopPump(db, started!.after.id, NOW)).toBeNull();
  });

  it('both sides at once: each side gets the elapsed minutes, at least 1', async () => {
    const db = freshDb();
    const [both] = await startPump(db, 'B', NOW - 20 * SECOND);
    expect((await stopPump(db, both!.after.id, NOW))!.after).toMatchObject({
      minLeft: 1,
      minRight: 1,
    });
  });

  it('a forgotten pump is still stopped, with the minutes at the limit', async () => {
    const db = freshDb();
    const [forgotten] = await startPump(db, 'L', NOW - 5 * HOUR);
    expect((await stopPump(db, forgotten!.after.id, NOW))!.after).toMatchObject({
      endAt: NOW,
      minLeft: MAX_PUMP_MIN,
    });
  });

  it('merges the corrections made in the sheet: minutes replaced or removed, ml added', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'B', NOW - 15 * MINUTE);
    const change = await stopPump(db, started!.after.id, NOW, {
      minLeft: null,
      minRight: 14,
      mlRight: 90,
    });
    expect(change!.after).toMatchObject({ endAt: NOW, minRight: 14, mlRight: 90 });
    expect(change!.after).not.toHaveProperty('minLeft');
    expect(change!.after).not.toHaveProperty('mlLeft');
  });

  it('refuses corrections that break the pumping rules and changes nothing', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'L', NOW - 15 * MINUTE);
    const id = started!.after.id;
    await expect(stopPump(db, id, NOW, { mlLeft: 501 })).rejects.toEqual(
      new ValidationError(['pump-invalid']),
    );
    await expect(stopPump(db, id, NOW, { minLeft: null })).rejects.toEqual(
      new ValidationError(['pump-empty']),
    );
    expect(await runningIds(db)).toEqual([id]);
  });

  it('undo lets the pump run again', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'L', NOW - 15 * MINUTE);
    const change = await stopPump(db, started!.after.id, NOW);
    expect(await restoreEvents(db, [change!], NOW + MINUTE)).toBe(true);
    expect(await db.events.get(started!.after.id)).toMatchObject({ side: 'L' });
    expect(await runningIds(db)).toEqual([started!.after.id]);
  });

  it('refuses an entry that is not a pump; stopTimer finishes a pump the same way', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - HOUR }],
      NOW,
    );
    await expect(stopPump(db, asleep!.id, NOW)).rejects.toThrow(/not a pump/);
    const [started] = await startPump(db, 'L', NOW - 15 * MINUTE);
    const change = await stopTimer(db, started!.after.id, NOW, NOW - 5 * MINUTE);
    expect(change!.after).toMatchObject({ endAt: NOW - 5 * MINUTE, minLeft: 10 });
    expect(change!.after).not.toHaveProperty('side');
  });

  it('ends at a chosen earlier time, counting the minutes up to it; never before the start nor in the future', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'R', NOW - 40 * MINUTE);
    const id = started!.after.id;
    await expect(stopPump(db, id, NOW, {}, NOW - 41 * MINUTE)).rejects.toEqual(
      new ValidationError(['end-before-start']),
    );
    await expect(stopPump(db, id, NOW, {}, NOW + HOUR)).rejects.toEqual(
      new ValidationError(['in-future']),
    );
    expect(await runningIds(db)).toEqual([id]);
    const change = await stopPump(db, id, NOW, {}, NOW - 15 * MINUTE);
    expect(change!.after).toMatchObject({ endAt: NOW - 15 * MINUTE, minRight: 25, updatedAt: NOW });
  });

  it('checks only the pumping rules: a long note or a start ahead of this clock never block the stop', async () => {
    const db = freshDb();
    const base = { type: 'pump', babyId: null, side: 'L', createdAt: NOW, updatedAt: NOW } as const;
    // Rows written by another device: one with a note longer than the limit, one whose clock ran ahead.
    const noted = {
      ...base,
      id: 'noted',
      startAt: NOW - 10 * MINUTE,
      note: 'x'.repeat(TEXT_LIMITS.note + 1),
    };
    const ahead = { ...base, id: 'ahead', startAt: NOW + HOUR };
    await db.events.bulkPut([noted, ahead] as TrackerEvent[]);
    expect((await stopPump(db, 'noted', NOW))!.after).toMatchObject({ endAt: NOW, minLeft: 10 });
    expect((await stopPump(db, 'ahead', NOW))!.after).toMatchObject({
      endAt: NOW + HOUR,
      minLeft: 1,
    });
    expect(await runningIds(db)).toEqual([]);
  });

  it('a deleted pump cannot be stopped', async () => {
    const db = freshDb();
    const [started] = await startPump(db, 'L', NOW - 15 * MINUTE);
    await deleteEvent(db, started!.after.id, NOW);
    await expect(stopPump(db, started!.after.id, NOW)).rejects.toThrow(/not found/);
  });

  it('undo of a stop is refused while another pump runs', async () => {
    const db = freshDb();
    const [first] = await startPump(db, 'L', NOW - 15 * MINUTE);
    const change = await stopPump(db, first!.after.id, NOW);
    const [second] = await startPump(db, 'R', NOW + MINUTE);
    expect(await restoreEvents(db, [change!], NOW + 2 * MINUTE)).toBe(false);
    expect(await runningIds(db)).toEqual([second!.after.id]);
    expect(await db.events.get(first!.after.id)).toMatchObject({ endAt: NOW, minLeft: 15 });
  });
});
