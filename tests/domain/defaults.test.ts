import { describe, expect, it } from 'vitest';
import { lastBottle, lastSideUse, nextSide } from '../../src/domain/defaults';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';

const T = new Date(2026, 8, 27, 9, 0).getTime();
const base = { createdAt: T, updatedAt: T };
const bottle = (
  id: string,
  babyId: string,
  startAt: number,
  ml: number,
  extra = {},
): TrackerEvent => ({
  ...base,
  id,
  babyId,
  type: 'bottle',
  startAt,
  ml,
  contents: 'formula',
  ...extra,
});
const feed = (
  id: string,
  babyId: string,
  startAt: number,
  sides: ('L' | 'R')[],
  extra = {},
): TrackerEvent => ({
  ...base,
  id,
  babyId,
  type: 'breastfeed',
  startAt,
  endAt: startAt + sides.length * 10 * MINUTE,
  segments: sides.map((side, i) => ({
    side,
    start: startAt + i * 10 * MINUTE,
    end: startAt + (i + 1) * 10 * MINUTE,
  })),
  ...extra,
});

describe('lastBottle', () => {
  it("is the baby's latest live bottle, ignoring deleted rows and the other baby", () => {
    const events = [
      bottle('1', 'a', T - 60 * MINUTE, 90),
      bottle('2', 'a', T - 30 * MINUTE, 120, { contents: 'breastmilk' }),
      bottle('3', 'a', T - 10 * MINUTE, 150, { deletedAt: T }),
      bottle('4', 'b', T - 5 * MINUTE, 60),
    ];
    expect(lastBottle(events, 'a')).toEqual({ ml: 120, contents: 'breastmilk' });
    expect(lastBottle(events, 'c')).toBeNull();
  });
});

describe('nextSide and lastSideUse', () => {
  it('offers the side opposite to the last side of the latest feed; left with no history', () => {
    expect(nextSide([], 'a')).toBe('L');
    const events = [
      feed('1', 'a', T - 3 * 60 * MINUTE, ['L', 'R']),
      feed('2', 'a', T - 60 * MINUTE, ['R']),
    ];
    expect(nextSide(events, 'a')).toBe('L');
    expect(
      nextSide([...events, feed('3', 'a', T - 30 * MINUTE, ['L'], { deletedAt: T })], 'a'),
    ).toBe('L');
    expect(nextSide([...events, feed('4', 'b', T, ['L'])], 'b')).toBe('R');
  });
  it('tells when a side was last used (its latest segment start)', () => {
    const events = [
      feed('1', 'a', T - 3 * 60 * MINUTE, ['L', 'R']),
      feed('2', 'a', T - 60 * MINUTE, ['R']),
    ];
    expect(lastSideUse(events, 'a', 'L')).toBe(T - 3 * 60 * MINUTE);
    expect(lastSideUse(events, 'a', 'R')).toBe(T - 60 * MINUTE);
    expect(lastSideUse(events, 'b', 'L')).toBeNull();
  });
});
