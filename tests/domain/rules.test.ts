import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../src/domain/time';
import type { BreastSegment, EventDraft, TrackerEvent } from '../../src/domain/types';
import { FUTURE_TOLERANCE_MS, ValidationError, validateBabyName, validateEvent } from '../../src/domain/rules';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();

function saved(draft: EventDraft, id = 'e1'): TrackerEvent {
  return { ...draft, id, createdAt: NOW, updatedAt: NOW } as TrackerEvent;
}

describe('validateEvent — common rules', () => {
  it('accepts a finished sleep', () => {
    expect(validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW - 60 * MINUTE, endAt: NOW }, [], NOW)).toEqual([]);
  });

  it('requires a baby except for pumping', () => {
    expect(validateEvent({ type: 'diaper', babyId: null, startAt: NOW, wet: true, dirty: false }, [], NOW)).toContain(
      'baby-required',
    );
    expect(validateEvent({ type: 'pump', babyId: null, startAt: NOW, mlLeft: 60 }, [], NOW)).toEqual([]);
  });

  it('allows a small clock skew but rejects times further in the future', () => {
    const ok: EventDraft = { type: 'sleep', babyId: 'a', startAt: NOW + FUTURE_TOLERANCE_MS - MINUTE };
    const late: EventDraft = { type: 'sleep', babyId: 'a', startAt: NOW + FUTURE_TOLERANCE_MS + MINUTE };
    expect(validateEvent(ok, [], NOW)).toEqual([]);
    expect(validateEvent(late, [], NOW)).toEqual(['in-future']);
    expect(validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW, endAt: NOW + 10 * MINUTE }, [], NOW)).toEqual([
      'in-future',
    ]);
  });

  it('rejects an end before the start', () => {
    expect(validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW, endAt: NOW - MINUTE }, [], NOW)).toEqual([
      'end-before-start',
    ]);
  });
});

describe('validateEvent — running timers', () => {
  const openSleepA = saved({ type: 'sleep', babyId: 'a', startAt: NOW - 30 * MINUTE }, 'running');

  it('allows only one running sleep per baby', () => {
    const draft: EventDraft = { type: 'sleep', babyId: 'a', startAt: NOW };
    expect(validateEvent(draft, [openSleepA], NOW)).toEqual(['already-running']);
    expect(validateEvent({ ...draft, babyId: 'b' }, [openSleepA], NOW)).toEqual([]);
  });

  it('allows only one running breastfeed per baby', () => {
    const openFeedA = saved(
      { type: 'breastfeed', babyId: 'a', startAt: NOW - 10 * MINUTE, segments: [{ side: 'L', start: NOW - 10 * MINUTE }] },
      'feeding',
    );
    const draft: EventDraft = { type: 'breastfeed', babyId: 'a', startAt: NOW, segments: [{ side: 'R', start: NOW }] };
    expect(validateEvent(draft, [openFeedA], NOW)).toEqual(['already-running']);
    expect(validateEvent({ ...draft, babyId: 'b' }, [openFeedA], NOW)).toEqual([]);
    expect(validateEvent(draft, [openSleepA], NOW)).toEqual([]);
  });

  it('ignores finished, deleted and self events', () => {
    const draft: EventDraft = { type: 'sleep', babyId: 'a', startAt: NOW };
    expect(validateEvent(draft, [{ ...openSleepA, endAt: NOW - MINUTE }], NOW)).toEqual([]);
    expect(validateEvent(draft, [{ ...openSleepA, deletedAt: NOW }], NOW)).toEqual([]);
    expect(validateEvent(draft, [openSleepA], NOW, 'running')).toEqual([]);
  });

  it('a finished entry never conflicts with a running one', () => {
    expect(
      validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW - 90 * MINUTE, endAt: NOW - 60 * MINUTE }, [openSleepA], NOW),
    ).toEqual([]);
  });
});

describe('validateEvent — breastfeeding segments', () => {
  const start = NOW - 20 * MINUTE;
  const draft = (segments: BreastSegment[], endAt?: number) =>
    ({ type: 'breastfeed', babyId: 'a', startAt: start, segments, ...(endAt === undefined ? {} : { endAt }) }) as EventDraft;

  it('accepts closed segments followed by one open segment', () => {
    expect(
      validateEvent(draft([{ side: 'L', start, end: start + 8 * MINUTE }, { side: 'R', start: start + 8 * MINUTE }]), [], NOW),
    ).toEqual([]);
  });

  it.each([
    ['no segments', []],
    ['an open segment that is not last', [{ side: 'L' as const, start }, { side: 'R' as const, start: start + MINUTE }]],
    ['overlapping segments', [{ side: 'L' as const, start, end: start + 10 * MINUTE }, { side: 'R' as const, start: start + 5 * MINUTE }]],
    ['a segment before the feed started', [{ side: 'L' as const, start: start - MINUTE }]],
    ['a segment that ends before it starts', [{ side: 'L' as const, start, end: start - MINUTE }]],
  ])('rejects %s', (_label, segments) => {
    expect(validateEvent(draft(segments), [], NOW)).toContain('segments-invalid');
  });

  it('a finished feed must have every segment closed within it', () => {
    expect(validateEvent(draft([{ side: 'L', start }], start + 10 * MINUTE), [], NOW)).toContain('segments-invalid');
    expect(validateEvent(draft([{ side: 'L', start, end: start + 12 * MINUTE }], start + 10 * MINUTE), [], NOW)).toContain(
      'segments-invalid',
    );
    expect(validateEvent(draft([{ side: 'L', start, end: start + 10 * MINUTE }], start + 10 * MINUTE), [], NOW)).toEqual([]);
  });
});

describe('validateEvent — amounts and diapers', () => {
  it.each([0, -5, 1001, Number.NaN])('rejects a bottle of %s ml', (ml) => {
    expect(validateEvent({ type: 'bottle', babyId: 'a', startAt: NOW, ml, contents: 'formula' }, [], NOW)).toEqual([
      'amount-invalid',
    ]);
  });

  it('accepts a normal bottle', () => {
    expect(validateEvent({ type: 'bottle', babyId: 'a', startAt: NOW, ml: 120, contents: 'breastmilk' }, [], NOW)).toEqual([]);
  });

  it('a diaper must be wet, dirty or both', () => {
    expect(validateEvent({ type: 'diaper', babyId: 'a', startAt: NOW, wet: false, dirty: false }, [], NOW)).toEqual([
      'diaper-empty',
    ]);
  });
});

describe('validateBabyName / ValidationError', () => {
  it('requires a non-blank name', () => {
    expect(validateBabyName('   ')).toEqual(['name-required']);
    expect(validateBabyName('Ada')).toEqual([]);
  });

  it('ValidationError carries its violations', () => {
    const error = new ValidationError(['diaper-empty']);
    expect(error).toBeInstanceOf(Error);
    expect(error.violations).toEqual(['diaper-empty']);
    expect(error.name).toBe('ValidationError');
  });
});
