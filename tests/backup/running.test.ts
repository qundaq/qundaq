import { describe, expect, it } from 'vitest';
import { findStale, repairRunning, stopTimerAt } from '../../src/backup/running';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { Baby, TrackerEvent } from '../../src/domain/types';

const T = 1_790_000_000_000;
const NOW = T + 10 * HOUR;
const baby = (id: string, extra: Partial<Baby> = {}): Baby => ({ id, name: id, color: '#7cb7ff', archived: false, createdAt: T, updatedAt: T, ...extra });
const BABIES = new Map([['a', baby('a')]]);
const sleep = (id: string, startAt: number, extra: Partial<TrackerEvent> = {}) =>
  ({ id, type: 'sleep', babyId: 'a', startAt, createdAt: startAt, updatedAt: startAt, ...extra }) as TrackerEvent;
const feed = (id: string, startAt: number, segments: { side: 'L' | 'R'; start: number; end?: number }[]) =>
  ({ id, type: 'breastfeed', babyId: 'a', startAt, segments, createdAt: startAt, updatedAt: startAt }) as TrackerEvent;
const context = { exportedAt: T, now: NOW, stopStale: new Set<string>() };

describe('stopTimerAt', () => {
  it('ends a timer at the given time, never before it started', () => {
    expect(stopTimerAt(sleep('s', T), T + HOUR, NOW)).toEqual({ ...sleep('s', T), endAt: T + HOUR, updatedAt: NOW });
    expect(stopTimerAt(sleep('s', T), T - HOUR, NOW)).toMatchObject({ endAt: T });
  });

  it("closes the last side, never before that side's start", () => {
    const running = feed('f', T, [
      { side: 'L', start: T, end: T + 20 * MINUTE },
      { side: 'R', start: T + 20 * MINUTE },
    ]);
    expect(stopTimerAt(running, T + 10 * MINUTE, NOW)).toMatchObject({
      endAt: T + 20 * MINUTE,
      segments: [
        { side: 'L', start: T, end: T + 20 * MINUTE },
        { side: 'R', start: T + 20 * MINUTE, end: T + 20 * MINUTE },
      ],
    });
  });
});

describe('repairRunning', () => {
  it('two running sleeps for one baby: the later one runs on, the other ends when it started', () => {
    const { changed, stopped } = repairRunning([sleep('early', T), sleep('late', T + HOUR)], BABIES, context);
    expect(changed).toEqual([{ ...sleep('early', T), endAt: T + HOUR, updatedAt: NOW }]);
    expect(stopped).toEqual([{ id: 'early', babyId: 'a', type: 'sleep', startAt: T, stopAt: T + HOUR, reason: 'collision' }]);
  });

  it('a tie on the start goes to the larger id, so both phones agree', () => {
    expect(repairRunning([sleep('b', T), sleep('a', T)], BABIES, context).changed.map((row) => row.id)).toEqual(['a']);
    expect(repairRunning([sleep('a', T), sleep('b', T)], BABIES, context).changed.map((row) => row.id)).toEqual(['a']);
  });

  it('a feed that switched sides after the other one started never gets a side ending before it begins', () => {
    // A started at 06:00 and switched at 06:20; B started at 06:10.
    const a = feed('a', T, [
      { side: 'L', start: T, end: T + 20 * MINUTE },
      { side: 'R', start: T + 20 * MINUTE },
    ]);
    const b = feed('b', T + 10 * MINUTE, [{ side: 'L', start: T + 10 * MINUTE }]);
    const { changed } = repairRunning([a, b], BABIES, context);
    expect(changed).toEqual([stopTimerAt(a, T + 20 * MINUTE, NOW)]);
  });

  it('different babies and different types do not collide; finished and deleted rows are left alone', () => {
    const rows = [
      sleep('ada', T),
      sleep('can', T + 1, { babyId: 'c' }),
      feed('ada-feed', T + 2, [{ side: 'L', start: T + 2 }]),
      sleep('done', T + 3, { endAt: T + 4 }),
      sleep('deleted', T + 5, { deletedAt: T + 6 }),
    ];
    expect(repairRunning(rows, new Map([...BABIES, ['c', baby('c')]]), context)).toEqual({ changed: [], stopped: [] });
  });

  it("stops a deleted baby's timers when the baby was deleted", () => {
    const babies = new Map([['a', baby('a', { deletedAt: T + HOUR, updatedAt: T + HOUR })]]);
    const { stopped } = repairRunning([sleep('s', T)], babies, context);
    expect(stopped).toEqual([{ id: 's', babyId: 'a', type: 'sleep', startAt: T, stopAt: T + HOUR, reason: 'deleted-baby' }]);
  });

  it('never throws on a malformed running row from the device, and stops it without guessing', () => {
    const broken = { id: 'broken', type: 'breastfeed', babyId: 'a', startAt: T, segments: 'broken', createdAt: T, updatedAt: T } as unknown as TrackerEvent;
    const good = feed('good', T + HOUR, [{ side: 'L', start: T + HOUR }]);
    const { changed } = repairRunning([broken, good], BABIES, context);
    expect(changed).toEqual([{ ...broken, endAt: T + HOUR, updatedAt: NOW }]);
    const noStart = { id: 'x', type: 'sleep', babyId: 'a', startAt: 'soon', createdAt: T, updatedAt: T } as unknown as TrackerEvent;
    expect(repairRunning([noStart, sleep('s', T)], BABIES, context).changed).toEqual([]);
  });

  it('never stops a timer in the future, even when the backup comes from a clock that ran ahead', () => {
    const { stopped } = repairRunning([sleep('s', T)], BABIES, { exportedAt: NOW + HOUR, now: NOW, stopStale: new Set(['s']) });
    expect(stopped[0]!.stopAt).toBe(NOW);
  });

  it('stops the chosen stale timers at the time of the backup, before anything else', () => {
    const { stopped } = repairRunning([sleep('old', T - 5 * HOUR), sleep('new', T + HOUR)], BABIES, {
      ...context,
      stopStale: new Set(['old']),
    });
    expect(stopped).toEqual([{ id: 'old', babyId: 'a', type: 'sleep', startAt: T - 5 * HOUR, stopAt: T, reason: 'stale' }]);
  });
});

describe('findStale', () => {
  it("flags a file's running timer that started before the device's newest entry of that type", () => {
    const fromFile = sleep('file', T - HOUR);
    const device = [sleep('device', T, { endAt: T + HOUR })];
    expect(findStale([fromFile, ...device], new Set(['file']), device, T, T + MINUTE)).toEqual([
      { id: 'file', babyId: 'a', type: 'sleep', startAt: T - HOUR },
    ]);
    // A diaper is not a sleep, and another baby's sleep is not this baby's.
    const other = [sleep('x', T, { babyId: 'c', endAt: T + 1 }), { ...sleep('y', T), type: 'diaper', wet: true, dirty: false } as TrackerEvent];
    expect(findStale([fromFile], new Set(['file']), other, T, T + MINUTE)).toEqual([]);
  });

  it('flags a running timer from a backup older than the "forgot to stop?" limit', () => {
    const running = feed('f', T - MINUTE, [{ side: 'L', start: T - MINUTE }]);
    expect(findStale([running], new Set(['f']), [], T, T + HOUR)).toEqual([]);
    expect(findStale([running], new Set(['f']), [], T, T + 3 * HOUR)).toHaveLength(1); // breastfeed: 2 h
    expect(findStale([sleep('s', T)], new Set(['s']), [], T, T + 11 * HOUR)).toEqual([]);
    expect(findStale([sleep('s', T)], new Set(['s']), [], T, T + 13 * HOUR)).toHaveLength(1); // sleep: 12 h
  });

  it("ignores the device's own timers", () => {
    expect(findStale([sleep('mine', T - HOUR)], new Set(), [sleep('newer', T)], T, NOW)).toEqual([]);
  });
});
