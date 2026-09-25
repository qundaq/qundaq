import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import { listRecentEvents, logEvents, stopEvent, switchBreastSide } from '../../src/db/events';
import { ValidationError } from '../../src/domain/rules';
import { DAY, MINUTE } from '../../src/domain/time';

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
    const [diaper] = await logEvents(db, [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }], NOW);
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
    ).rejects.toEqual(new ValidationError(['already-running']));
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
    const [sleep] = await logEvents(db, [{ type: 'sleep', babyId: 'a', startAt: NOW - 40 * MINUTE }], NOW - 40 * MINUTE);
    await stopEvent(db, sleep!.id, NOW);
    expect(await db.events.get(sleep!.id)).toMatchObject({ endAt: NOW, updatedAt: NOW });
  });

  it('stopEvent closes the open breastfeeding segment', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(db, [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }], start);
    await stopEvent(db, feed!.id, NOW);
    expect(await db.events.get(feed!.id)).toMatchObject({ endAt: NOW, segments: [{ side: 'L', start, end: NOW }] });
  });

  it('switchBreastSide closes the current side and opens the other', async () => {
    const db = freshDb();
    const start = NOW - 10 * MINUTE;
    const [feed] = await logEvents(db, [{ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }], start);
    await switchBreastSide(db, feed!.id, NOW);
    const stored = await db.events.get(feed!.id);
    expect(stored).toMatchObject({ segments: [{ side: 'L', start, end: NOW }, { side: 'R', start: NOW }], updatedAt: NOW });
    expect(stored!.endAt).toBeUndefined();
  });

  it('refuses to stop or switch something that is not running', async () => {
    const db = freshDb();
    const [done] = await logEvents(db, [{ type: 'sleep', babyId: 'a', startAt: NOW - 60 * MINUTE, endAt: NOW - 30 * MINUTE }], NOW);
    await expect(stopEvent(db, done!.id, NOW)).rejects.toThrow(/not running/);
    await expect(switchBreastSide(db, done!.id, NOW)).rejects.toThrow(/not a running breastfeed/);
    await expect(stopEvent(db, 'missing', NOW)).rejects.toThrow(/not running/);
  });
});
