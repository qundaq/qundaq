import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import {
  listRunningEvents,
  logEvents,
  recordEvents,
  restoreEvents,
  stopEvent,
  stopTimer,
} from '../../src/db/events';
import { ValidationError } from '../../src/domain/rules';
import { MINUTE } from '../../src/domain/time';
import type { EventDraft } from '../../src/domain/types';

const NOW = new Date(2026, 8, 27, 3, 0).getTime();
const opened: TrackerDb[] = [];
const freshDb = () => {
  const db = openDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

const sleep = (babyId: string, startAt: number): EventDraft => ({ type: 'sleep', babyId, startAt });
const feed = (babyId: string, startAt: number, side: 'L' | 'R' = 'L'): EventDraft => ({
  type: 'breastfeed',
  babyId,
  startAt,
  segments: [{ side, start: startAt }],
});

describe('recordEvents', () => {
  it('returns created rows as changes with no "before"', async () => {
    const db = freshDb();
    const changes = await recordEvents(db, [sleep('a', NOW)], NOW);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.before).toBeNull();
    expect(changes[0]!.after).toMatchObject({ type: 'sleep', babyId: 'a', startAt: NOW });
  });

  it('without endRunning, a feed for a sleeping baby is refused and nothing changes', async () => {
    const db = freshDb();
    await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW);
    await expect(recordEvents(db, [feed('a', NOW)], NOW)).rejects.toEqual(
      new ValidationError(['already-running'], ['a']),
    );
    expect(await db.events.count()).toBe(1);
  });

  it('with endRunning, the running sleep ends at the feed start in the same write', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const changes = await recordEvents(db, [feed('a', NOW - 5 * MINUTE)], NOW, {
      endRunning: true,
    });
    expect(changes.map((c) => [c.before?.id ?? null, c.after.type])).toEqual([
      [asleep!.id, 'sleep'],
      [null, 'breastfeed'],
    ]);
    expect(changes[0]!.after).toMatchObject({ endAt: NOW - 5 * MINUTE, updatedAt: NOW });
    const running = await listRunningEvents(db);
    expect(running.map((e) => e.type)).toEqual(['breastfeed']);
  });

  it('ends a running feed (closing its side) when a sleep starts', async () => {
    const db = freshDb();
    await logEvents(db, [feed('a', NOW - 20 * MINUTE)], NOW - 20 * MINUTE);
    const [stop] = await recordEvents(db, [sleep('a', NOW)], NOW, { endRunning: true });
    expect(stop!.after).toMatchObject({
      type: 'breastfeed',
      endAt: NOW,
      segments: [{ side: 'L', start: NOW - 20 * MINUTE, end: NOW }],
    });
  });

  it('refuses a new start earlier than the running timer and writes nothing', async () => {
    const db = freshDb();
    await logEvents(db, [sleep('a', NOW - 10 * MINUTE)], NOW - 10 * MINUTE);
    await expect(
      recordEvents(db, [feed('a', NOW - 15 * MINUTE)], NOW, { endRunning: true }),
    ).rejects.toEqual(new ValidationError(['running-overlap'], ['a']));
    expect((await listRunningEvents(db)).map((e) => e.type)).toEqual(['sleep']);
    expect(await db.events.count()).toBe(1);
  });

  it('handles two babies in one write and leaves the other type alone for a finished entry', async () => {
    const db = freshDb();
    await logEvents(db, [sleep('a', NOW - 30 * MINUTE), sleep('b', NOW - 30 * MINUTE)], NOW);
    const changes = await recordEvents(db, [feed('a', NOW), feed('b', NOW)], NOW, {
      endRunning: true,
    });
    expect(changes.filter((c) => c.before !== null)).toHaveLength(2);
    const finished: EventDraft = {
      type: 'breastfeed',
      babyId: 'a',
      startAt: NOW - 50 * MINUTE,
      endAt: NOW - 40 * MINUTE,
      segments: [{ side: 'R', start: NOW - 50 * MINUTE, end: NOW - 40 * MINUTE }],
    };
    const more = await recordEvents(db, [finished], NOW, { endRunning: true });
    expect(more.every((c) => c.before === null)).toBe(true);
  });

  it('logEvents still returns only the created rows', async () => {
    const db = freshDb();
    const created = await logEvents(db, [sleep('a', NOW)], NOW);
    expect(created.map((e) => e.type)).toEqual(['sleep']);
  });
});

describe('stopTimer', () => {
  it('stops at now, returns the change, and null the second time', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const change = await stopTimer(db, asleep!.id, NOW);
    expect(change!.before).toMatchObject({ id: asleep!.id });
    expect(change!.before!.endAt).toBeUndefined();
    expect(change!.after).toMatchObject({ endAt: NOW, updatedAt: NOW });
    expect(await stopTimer(db, asleep!.id, NOW)).toBeNull();
    expect(await stopEvent(db, asleep!.id, NOW)).toBe(false);
  });

  it('stops at a chosen earlier time, never before the current side began nor in the future', async () => {
    const db = freshDb();
    const [feeding] = await logEvents(db, [feed('a', NOW - 30 * MINUTE)], NOW - 30 * MINUTE);
    await expect(stopTimer(db, feeding!.id, NOW, NOW - 31 * MINUTE)).rejects.toEqual(
      new ValidationError(['end-before-start']),
    );
    await expect(stopTimer(db, feeding!.id, NOW, NOW + 6 * MINUTE)).rejects.toEqual(
      new ValidationError(['in-future']),
    );
    const change = await stopTimer(db, feeding!.id, NOW, NOW - 15 * MINUTE);
    expect(change!.after).toMatchObject({
      endAt: NOW - 15 * MINUTE,
      updatedAt: NOW,
      segments: [{ side: 'L', start: NOW - 30 * MINUTE, end: NOW - 15 * MINUTE }],
    });
  });
});

describe('restoreEvents', () => {
  it('undoes a created row with a soft delete', async () => {
    const db = freshDb();
    const changes = await recordEvents(db, [sleep('a', NOW)], NOW);
    expect(await restoreEvents(db, changes, NOW + MINUTE)).toBe(true);
    const row = await db.events.get(changes[0]!.after.id);
    expect(row).toMatchObject({ deletedAt: NOW + MINUTE, updatedAt: NOW + MINUTE });
    expect(await listRunningEvents(db)).toEqual([]);
  });

  it('undoes a stop: the timer runs again with a fresh updatedAt', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const change = await stopTimer(db, asleep!.id, NOW);
    expect(await restoreEvents(db, [change!], NOW + MINUTE)).toBe(true);
    const row = await db.events.get(asleep!.id);
    expect(row!.endAt).toBeUndefined();
    expect(row!.updatedAt).toBe(NOW + MINUTE);
    expect((await listRunningEvents(db)).map((e) => e.id)).toEqual([asleep!.id]);
  });

  it('undoes a feed that ended a sleep: the feed is gone and the sleep runs again', async () => {
    const db = freshDb();
    await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const changes = await recordEvents(db, [feed('a', NOW)], NOW, { endRunning: true });
    expect(await restoreEvents(db, changes, NOW + MINUTE)).toBe(true);
    expect((await listRunningEvents(db)).map((e) => e.type)).toEqual(['sleep']);
  });

  it('restores nothing when a stopped row changed since', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const change = await stopTimer(db, asleep!.id, NOW);
    await db.events.update(asleep!.id, { note: 'edited', updatedAt: NOW + 1 });
    expect(await restoreEvents(db, [change!], NOW + MINUTE)).toBe(false);
    expect((await db.events.get(asleep!.id))!.endAt).toBe(NOW);
  });

  it('restores nothing when the baby has another running timer now', async () => {
    const db = freshDb();
    const [asleep] = await logEvents(db, [sleep('a', NOW - 40 * MINUTE)], NOW - 40 * MINUTE);
    const change = await stopTimer(db, asleep!.id, NOW);
    await logEvents(db, [feed('a', NOW + MINUTE)], NOW + MINUTE);
    expect(await restoreEvents(db, [change!], NOW + 2 * MINUTE)).toBe(false);
    expect((await db.events.get(asleep!.id))!.endAt).toBe(NOW);
  });
});
