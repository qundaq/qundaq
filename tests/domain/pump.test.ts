import { describe, expect, it } from 'vitest';
import { finishedPump, pumpMinutes, pumpStartAt } from '../../src/domain/pump';
import { MAX_PUMP_MIN, validateEvent } from '../../src/domain/rules';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { PumpSide, TrackerEvent } from '../../src/domain/types';

const NOW = new Date(2026, 9, 5, 9, 0).getTime();
const SECOND = 1000;

type Pump = Extract<TrackerEvent, { type: 'pump' }>;

const running = (side: PumpSide, startAt = NOW - 12 * MINUTE): Pump => ({
  id: 'p',
  type: 'pump',
  babyId: null,
  startAt,
  side,
  createdAt: startAt,
  updatedAt: startAt,
});

describe('pumpMinutes', () => {
  it('rounds to the nearest minute, never below 1 nor above the limit', () => {
    expect(pumpMinutes(12 * MINUTE + 29 * SECOND)).toBe(12);
    expect(pumpMinutes(12 * MINUTE + 30 * SECOND)).toBe(13);
    expect(pumpMinutes(20 * SECOND)).toBe(1);
    expect(pumpMinutes(0)).toBe(1);
    expect(pumpMinutes(5 * HOUR)).toBe(MAX_PUMP_MIN);
  });
});

describe('pumpStartAt', () => {
  it('lays the sides one after the other before the end; no minutes is a moment', () => {
    expect(pumpStartAt(NOW, 12, 10)).toBe(NOW - 22 * MINUTE);
    expect(pumpStartAt(NOW, 15)).toBe(NOW - 15 * MINUTE);
    expect(pumpStartAt(NOW, undefined, 8)).toBe(NOW - 8 * MINUTE);
    expect(pumpStartAt(NOW)).toBe(NOW);
  });
});

describe('finishedPump', () => {
  it.each<[PumpSide, object]>([
    ['L', { minLeft: 12 }],
    ['R', { minRight: 12 }],
    ['B', { minLeft: 12, minRight: 12 }],
  ])('side %s puts the elapsed minutes on %o and drops the side', (side, minutes) => {
    const done = finishedPump(running(side), NOW);
    expect(done).toStrictEqual({
      id: 'p',
      type: 'pump',
      babyId: null,
      startAt: NOW - 12 * MINUTE,
      endAt: NOW,
      ...minutes,
      createdAt: NOW - 12 * MINUTE,
      updatedAt: NOW - 12 * MINUTE,
    });
    expect(validateEvent(done, [], NOW)).toEqual([]);
  });

  it('keeps the ml already on the pump; the elapsed minutes replace the side they belong to', () => {
    const pump: Pump = { ...running('L'), minLeft: 3, minRight: 4, mlLeft: 50 };
    expect(finishedPump(pump, NOW)).toMatchObject({ minLeft: 12, minRight: 4, mlLeft: 50 });
  });

  it('never ends before the start', () => {
    expect(finishedPump(running('L', NOW + MINUTE), NOW)).toMatchObject({
      endAt: NOW + MINUTE,
      minLeft: 1,
    });
  });
});
