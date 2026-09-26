import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type TrackerDb } from '../../src/db/db';
import {
  OVERLAP_LOOKBACK_MS,
  deleteEvent,
  listEventsOverlapping,
  listGrowth,
  listRunningEvents,
  logEvents,
  recentMedicationNames,
  updateEvent,
} from '../../src/db/events';
import { DAY, HOUR, MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';

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

let seq = 0;
function row(draft: EventDraft, extra: Partial<TrackerEvent> = {}): TrackerEvent {
  seq += 1;
  return {
    ...draft,
    id: `r${seq}`,
    createdAt: draft.startAt,
    updatedAt: draft.startAt,
    ...extra,
  } as TrackerEvent;
}
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();

describe('listEventsOverlapping', () => {
  it('returns what overlaps the window, running timers included, oldest first', async () => {
    const db = freshDb();
    const inside = row({
      type: 'diaper',
      babyId: 'a',
      startAt: at(25, 8),
      wet: true,
      dirty: false,
    });
    const lastMinute = row({
      type: 'diaper',
      babyId: 'a',
      startAt: at(25, 23, 59),
      wet: true,
      dirty: false,
    });
    const dayBefore = row({
      type: 'diaper',
      babyId: 'a',
      startAt: at(24, 23, 59),
      wet: true,
      dirty: false,
    });
    const acrossMidnight = row({
      type: 'sleep',
      babyId: 'a',
      startAt: at(24, 22),
      endAt: at(25, 6),
    });
    const endedBefore = row({ type: 'sleep', babyId: 'a', startAt: at(24, 20), endAt: at(24, 21) });
    const runningForDays = row({ type: 'sleep', babyId: 'b', startAt: at(22, 10) });
    const nextDay = row({ type: 'sleep', babyId: 'a', startAt: at(26, 0), endAt: at(26, 1) });
    const deleted = row(
      { type: 'diaper', babyId: 'a', startAt: at(25, 9), wet: true, dirty: false },
      { deletedAt: at(25, 10) },
    );
    await db.events.bulkAdd([
      inside,
      lastMinute,
      dayBefore,
      acrossMidnight,
      endedBefore,
      runningForDays,
      nextDay,
      deleted,
    ]);

    const found = await listEventsOverlapping(db, at(25, 0), at(26, 0), NOW);
    expect(found.map((event) => event.id)).toEqual([
      runningForDays.id,
      acrossMidnight.id,
      inside.id,
      lastMinute.id,
    ]);
  });

  it('leaves out finished entries that began before the look-back (a documented limit)', async () => {
    const db = freshDb();
    await db.events.add(
      row({
        type: 'sleep',
        babyId: 'a',
        startAt: at(25, 0) - OVERLAP_LOOKBACK_MS - HOUR,
        endAt: at(25, 1),
      }),
    );
    expect(await listEventsOverlapping(db, at(25, 0), at(26, 0), NOW)).toEqual([]);
  });

  it('a running entry lasts until now, not beyond', async () => {
    const db = freshDb();
    const running = row({ type: 'sleep', babyId: 'a', startAt: at(25, 11) });
    await db.events.add(running);
    expect(await listEventsOverlapping(db, at(25, 13), at(25, 14), at(25, 12))).toEqual([]);
    expect(
      (await listEventsOverlapping(db, at(25, 0), at(26, 0), at(25, 12))).map((event) => event.id),
    ).toEqual([running.id]);
  });
});

describe('listGrowth', () => {
  it("returns one baby's growth entries, oldest first, without deleted ones", async () => {
    const db = freshDb();
    const later = row({ type: 'growth', babyId: 'a', startAt: at(20, 9), weightG: 3600 });
    const earlier = row({ type: 'growth', babyId: 'a', startAt: at(10, 9), weightG: 3300 });
    const otherBaby = row({ type: 'growth', babyId: 'b', startAt: at(15, 9), weightG: 3100 });
    const gone = row(
      { type: 'growth', babyId: 'a', startAt: at(12, 9), weightG: 3350 },
      { deletedAt: at(12, 10) },
    );
    const diaper = row({
      type: 'diaper',
      babyId: 'a',
      startAt: at(11, 9),
      wet: true,
      dirty: false,
    });
    await db.events.bulkAdd([later, earlier, otherBaby, gone, diaper]);
    expect(await listGrowth(db, 'a')).toEqual([earlier, later]);
  });
});

describe('recentMedicationNames', () => {
  const med = (name: string, daysAgo: number, dose?: string, extra: Partial<TrackerEvent> = {}) =>
    row(
      {
        type: 'medication',
        babyId: 'a',
        startAt: NOW - daysAgo * DAY,
        name,
        ...(dose === undefined ? {} : { dose }),
      },
      extra,
    );

  it('lists distinct names, newest first, each with its latest spelling and dose', async () => {
    const db = freshDb();
    await db.events.bulkAdd([
      med('D vitamini', 2, '400 IU'),
      med('d vitamini', 1, '2 damla'),
      med('Parasetamol', 3),
      med('İbuprofen', 4, '2,5 ml'),
      med('ibuprofen', 5),
      med('Eski ilaç', 61),
      med('Silinen', 1, undefined, { deletedAt: NOW }),
    ]);
    expect(await recentMedicationNames(db, NOW)).toEqual([
      { name: 'd vitamini', dose: '2 damla' },
      { name: 'Parasetamol' },
      { name: 'İbuprofen', dose: '2,5 ml' },
    ]);
  });

  it('stops at the limit', async () => {
    const db = freshDb();
    await db.events.bulkAdd(['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => med(name, i)));
    expect((await recentMedicationNames(db, NOW)).map((m) => m.name)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(await recentMedicationNames(db, NOW, 2)).toHaveLength(2);
  });
});

describe('updateEvent', () => {
  it('replaces the entry, keeping its id, group and creation time', async () => {
    const db = freshDb();
    const [a, b] = await logEvents(
      db,
      [
        { type: 'bottle', babyId: 'a', startAt: NOW - HOUR, ml: 90, contents: 'formula' },
        { type: 'bottle', babyId: 'b', startAt: NOW - HOUR, ml: 90, contents: 'formula' },
      ],
      NOW - HOUR,
    );
    const updated = await updateEvent(
      db,
      a!.id,
      { type: 'bottle', babyId: 'a', startAt: NOW - 90 * MINUTE, ml: 120, contents: 'breastmilk' },
      NOW,
    );
    expect(updated).toEqual({
      type: 'bottle',
      babyId: 'a',
      startAt: NOW - 90 * MINUTE,
      ml: 120,
      contents: 'breastmilk',
      id: a!.id,
      groupId: a!.groupId,
      createdAt: NOW - HOUR,
      updatedAt: NOW,
    });
    expect(await db.events.get(a!.id)).toEqual(updated);
    expect(await db.events.get(b!.id)).toEqual(b);
  });

  it('writes the whole row, so fields the draft leaves out are gone', async () => {
    const db = freshDb();
    const [diaper] = await logEvents(
      db,
      [
        {
          type: 'diaper',
          babyId: 'a',
          startAt: NOW - HOUR,
          wet: true,
          dirty: true,
          stoolColor: 'green',
          consistency: 'soft',
          note: 'yeşil',
        },
      ],
      NOW - HOUR,
    );
    await updateEvent(
      db,
      diaper!.id,
      { type: 'diaper', babyId: 'a', startAt: NOW - HOUR, wet: true, dirty: false },
      NOW,
    );
    const stored = await db.events.get(diaper!.id);
    expect(stored).toEqual({
      type: 'diaper',
      babyId: 'a',
      startAt: NOW - HOUR,
      wet: true,
      dirty: false,
      id: diaper!.id,
      createdAt: NOW - HOUR,
      updatedAt: NOW,
    });
    expect(stored).not.toHaveProperty('stoolColor');
    expect(stored).not.toHaveProperty('note');
  });

  it('refuses to change the type', async () => {
    const db = freshDb();
    const [diaper] = await logEvents(
      db,
      [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }],
      NOW,
    );
    await expect(
      updateEvent(
        db,
        diaper!.id,
        { type: 'bottle', babyId: 'a', startAt: NOW, ml: 90, contents: 'formula' },
        NOW,
      ),
    ).rejects.toThrow(`Event ${diaper!.id} is a diaper, not a bottle`);
  });

  it('never restarts a finished timer', async () => {
    const db = freshDb();
    const [done] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 2 * HOUR, endAt: NOW - HOUR }],
      NOW,
    );
    await expect(
      updateEvent(db, done!.id, { type: 'sleep', babyId: 'a', startAt: NOW - 2 * HOUR }, NOW),
    ).rejects.toThrow(`Event ${done!.id} has finished and cannot be restarted`);
  });

  it('keeps a running timer running when only its start moves', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - HOUR }],
      NOW - HOUR,
    );
    await updateEvent(db, sleep!.id, { type: 'sleep', babyId: 'a', startAt: NOW - 2 * HOUR }, NOW);
    expect((await listRunningEvents(db)).map((event) => event.id)).toEqual([sleep!.id]);
  });

  it('finishes a running timer at a chosen time, which takes it off the running index', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 2 * HOUR }],
      NOW - 2 * HOUR,
    );
    const updated = await updateEvent(
      db,
      sleep!.id,
      { type: 'sleep', babyId: 'a', startAt: NOW - 2 * HOUR, endAt: NOW - 30 * MINUTE },
      NOW,
    );
    expect(updated.endAt).toBe(NOW - 30 * MINUTE);
    expect(await listRunningEvents(db)).toEqual([]);
  });

  it('validates like logging, the duration limit included', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - 30 * HOUR }],
      NOW - 30 * HOUR,
    );
    await expect(
      updateEvent(
        db,
        sleep!.id,
        { type: 'sleep', babyId: 'a', startAt: NOW - 30 * HOUR, endAt: NOW },
        NOW,
      ),
    ).rejects.toMatchObject({ violations: ['too-long'] });
  });

  it('names the baby when the change clashes with a running timer', async () => {
    const db = freshDb();
    const [sleepA] = await logEvents(
      db,
      [
        { type: 'sleep', babyId: 'a', startAt: NOW - HOUR },
        { type: 'sleep', babyId: 'b', startAt: NOW - HOUR },
      ],
      NOW,
    );
    await expect(
      updateEvent(db, sleepA!.id, { type: 'sleep', babyId: 'b', startAt: NOW - HOUR }, NOW),
    ).rejects.toMatchObject({
      violations: ['already-running'],
      babyIds: ['b'],
    });
  });

  it('refuses a missing or deleted entry', async () => {
    const db = freshDb();
    const draft: EventDraft = {
      type: 'diaper',
      babyId: 'a',
      startAt: NOW,
      wet: true,
      dirty: false,
    };
    const [diaper] = await logEvents(db, [draft], NOW);
    await deleteEvent(db, diaper!.id, NOW);
    await expect(updateEvent(db, 'missing', draft, NOW)).rejects.toThrow('Event missing not found');
    await expect(updateEvent(db, diaper!.id, draft, NOW)).rejects.toThrow(
      `Event ${diaper!.id} not found`,
    );
  });
});

describe('deleteEvent', () => {
  it('soft-deletes and takes a running timer off the running index', async () => {
    const db = freshDb();
    const [sleep] = await logEvents(
      db,
      [{ type: 'sleep', babyId: 'a', startAt: NOW - HOUR }],
      NOW - HOUR,
    );
    await deleteEvent(db, sleep!.id, NOW);
    const stored = await db.events.get(sleep!.id);
    expect(stored).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
    expect(stored).not.toHaveProperty('open');
    expect(await listRunningEvents(db)).toEqual([]);
  });

  it('deleting twice keeps the first deletion time', async () => {
    const db = freshDb();
    const [diaper] = await logEvents(
      db,
      [{ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }],
      NOW,
    );
    await deleteEvent(db, diaper!.id, NOW);
    await deleteEvent(db, diaper!.id, NOW + HOUR);
    expect(await db.events.get(diaper!.id)).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
  });

  it('refuses an unknown entry', async () => {
    const db = freshDb();
    await expect(deleteEvent(db, 'missing', NOW)).rejects.toThrow('Event missing not found');
  });
});
