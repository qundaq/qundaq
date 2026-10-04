import { describe, expect, it } from 'vitest';
import { matchesFilters, pickBaby, visibleEvents } from '../../src/domain/filters';

describe('visibleEvents', () => {
  it('keeps pumps and the events of live babies', () => {
    const events = [
      { id: 1, babyId: 'a' },
      { id: 2, babyId: 'gone' },
      { id: 3, babyId: null },
    ];
    expect(visibleEvents(events, new Set(['a'])).map((event) => event.id)).toEqual([1, 3]);
  });
});

describe('matchesFilters', () => {
  it('"all babies" includes pumps; one baby excludes them', () => {
    expect(matchesFilters({ babyId: null, type: 'pump' }, null, 'all')).toBe(true);
    expect(matchesFilters({ babyId: null, type: 'pump' }, 'a', 'all')).toBe(false);
    expect(matchesFilters({ babyId: 'a', type: 'diaper' }, 'a', 'all')).toBe(true);
    expect(matchesFilters({ babyId: 'b', type: 'diaper' }, 'a', 'all')).toBe(false);
  });

  it('groups the types', () => {
    expect(matchesFilters({ babyId: 'a', type: 'breastfeed' }, null, 'feeding')).toBe(true);
    expect(matchesFilters({ babyId: 'a', type: 'bottle' }, null, 'feeding')).toBe(true);
    expect(matchesFilters({ babyId: 'a', type: 'sleep' }, null, 'feeding')).toBe(false);
    expect(matchesFilters({ babyId: 'a', type: 'sleep' }, null, 'sleep')).toBe(true);
    expect(matchesFilters({ babyId: 'a', type: 'diaper' }, null, 'diaper')).toBe(true);
    for (const type of ['pump', 'growth', 'temperature', 'medication', 'healthNote'] as const) {
      expect(matchesFilters({ babyId: 'a', type }, null, 'other')).toBe(true);
    }
    expect(matchesFilters({ babyId: 'a', type: 'diaper' }, null, 'other')).toBe(false);
  });
});

describe('pickBaby', () => {
  const babies = [{ id: 'a' }, { id: 'b' }];

  it('keeps a live choice, else the first baby', () => {
    expect(pickBaby(babies, 'b')).toBe('b');
    expect(pickBaby(babies, 'gone')).toBe('a');
    expect(pickBaby(babies, null)).toBe('a');
    expect(pickBaby([], null)).toBeNull();
  });
});
