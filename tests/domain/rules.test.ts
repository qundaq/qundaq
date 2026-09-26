import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { BreastSegment, EventDraft, TrackerEvent } from '../../src/domain/types';
import {
  FUTURE_TOLERANCE_MS,
  MAX_DURATION_MS,
  MIX_NAME_MAX,
  ValidationError,
  editedMinutesValid,
  validateBabyName,
  validateEvent,
  validateMixName,
  type RuleViolation,
} from '../../src/domain/rules';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();

function saved(draft: EventDraft, id = 'e1'): TrackerEvent {
  return { ...draft, id, createdAt: NOW, updatedAt: NOW };
}

describe('validateEvent — common rules', () => {
  it('accepts a finished sleep', () => {
    expect(
      validateEvent(
        { type: 'sleep', babyId: 'a', startAt: NOW - 60 * MINUTE, endAt: NOW },
        [],
        NOW,
      ),
    ).toEqual([]);
  });

  it('requires a baby except for pumping', () => {
    expect(
      validateEvent(
        { type: 'diaper', babyId: null, startAt: NOW, wet: true, dirty: false },
        [],
        NOW,
      ),
    ).toContain('baby-required');
    expect(
      validateEvent({ type: 'pump', babyId: null, startAt: NOW, mlLeft: 60 }, [], NOW),
    ).toEqual([]);
  });

  it('allows a small clock skew but rejects times further in the future', () => {
    const ok: EventDraft = {
      type: 'sleep',
      babyId: 'a',
      startAt: NOW + FUTURE_TOLERANCE_MS - MINUTE,
    };
    const late: EventDraft = {
      type: 'sleep',
      babyId: 'a',
      startAt: NOW + FUTURE_TOLERANCE_MS + MINUTE,
    };
    expect(validateEvent(ok, [], NOW)).toEqual([]);
    expect(validateEvent(late, [], NOW)).toEqual(['in-future']);
    expect(
      validateEvent(
        { type: 'sleep', babyId: 'a', startAt: NOW, endAt: NOW + 10 * MINUTE },
        [],
        NOW,
      ),
    ).toEqual(['in-future']);
  });

  it('rejects an end before the start', () => {
    expect(
      validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW, endAt: NOW - MINUTE }, [], NOW),
    ).toEqual(['end-before-start']);
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
      {
        type: 'breastfeed',
        babyId: 'a',
        startAt: NOW - 10 * MINUTE,
        segments: [{ side: 'L', start: NOW - 10 * MINUTE }],
      },
      'feeding',
    );
    const draft: EventDraft = {
      type: 'breastfeed',
      babyId: 'a',
      startAt: NOW,
      segments: [{ side: 'R', start: NOW }],
    };
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
      validateEvent(
        { type: 'sleep', babyId: 'a', startAt: NOW - 90 * MINUTE, endAt: NOW - 60 * MINUTE },
        [openSleepA],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('validateEvent — breastfeeding segments', () => {
  const start = NOW - 20 * MINUTE;
  const draft = (segments: BreastSegment[], endAt?: number) =>
    ({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      segments,
      ...(endAt === undefined ? {} : { endAt }),
    }) as EventDraft;

  it('accepts closed segments followed by one open segment', () => {
    expect(
      validateEvent(
        draft([
          { side: 'L', start, end: start + 8 * MINUTE },
          { side: 'R', start: start + 8 * MINUTE },
        ]),
        [],
        NOW,
      ),
    ).toEqual([]);
  });

  it.each([
    ['no segments', []],
    [
      'an open segment that is not last',
      [
        { side: 'L' as const, start },
        { side: 'R' as const, start: start + MINUTE },
      ],
    ],
    [
      'overlapping segments',
      [
        { side: 'L' as const, start, end: start + 10 * MINUTE },
        { side: 'R' as const, start: start + 5 * MINUTE },
      ],
    ],
    ['a segment before the feed started', [{ side: 'L' as const, start: start - MINUTE }]],
    ['a segment that ends before it starts', [{ side: 'L' as const, start, end: start - MINUTE }]],
  ])('rejects %s', (_label, segments) => {
    expect(validateEvent(draft(segments), [], NOW)).toContain('segments-invalid');
  });

  it('a finished feed must have every segment closed within it', () => {
    expect(validateEvent(draft([{ side: 'L', start }], start + 10 * MINUTE), [], NOW)).toContain(
      'segments-invalid',
    );
    expect(
      validateEvent(
        draft([{ side: 'L', start, end: start + 12 * MINUTE }], start + 10 * MINUTE),
        [],
        NOW,
      ),
    ).toContain('segments-invalid');
    expect(
      validateEvent(
        draft([{ side: 'L', start, end: start + 10 * MINUTE }], start + 10 * MINUTE),
        [],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('validateEvent — amounts and diapers', () => {
  it.each([0, -5, 1001, Number.NaN])('rejects a bottle of %s ml', (ml) => {
    expect(
      validateEvent(
        { type: 'bottle', babyId: 'a', startAt: NOW, ml, contents: 'formula' },
        [],
        NOW,
      ),
    ).toEqual(['amount-invalid']);
  });

  it('accepts a normal bottle', () => {
    expect(
      validateEvent(
        { type: 'bottle', babyId: 'a', startAt: NOW, ml: 120, contents: 'breastmilk' },
        [],
        NOW,
      ),
    ).toEqual([]);
  });

  it('a diaper must be wet, dirty or both', () => {
    expect(
      validateEvent(
        { type: 'diaper', babyId: 'a', startAt: NOW, wet: false, dirty: false },
        [],
        NOW,
      ),
    ).toEqual(['diaper-empty']);
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

describe('validateEvent — duration limit', () => {
  it('rejects a finished sleep longer than 24 hours', () => {
    expect(
      validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW - 25 * HOUR, endAt: NOW }, [], NOW),
    ).toEqual(['too-long']);
    expect(
      validateEvent(
        { type: 'sleep', babyId: 'a', startAt: NOW - MAX_DURATION_MS.sleep, endAt: NOW },
        [],
        NOW,
      ),
    ).toEqual([]);
  });

  it('rejects a finished feed longer than 4 hours, pauses included', () => {
    const startAt = NOW - 4 * HOUR - MINUTE;
    const draft: EventDraft = {
      type: 'breastfeed',
      babyId: 'a',
      startAt,
      endAt: NOW,
      segments: [
        { side: 'L', start: startAt, end: startAt + 10 * MINUTE },
        { side: 'R', start: NOW - 10 * MINUTE, end: NOW },
      ],
    };
    expect(validateEvent(draft, [], NOW)).toEqual(['too-long']);
  });

  it('never checks running entries, however old', () => {
    expect(
      validateEvent({ type: 'sleep', babyId: 'a', startAt: NOW - 30 * HOUR }, [], NOW),
    ).toEqual([]);
  });
});

describe('validateEvent — pumping', () => {
  it.each<[Partial<{ mlLeft: number; mlRight: number }>, RuleViolation[]]>([
    [{}, ['pump-empty']],
    [{ mlLeft: 60 }, []],
    [{ mlRight: 40 }, []],
    [{ mlLeft: 60, mlRight: 45 }, []],
    [{ mlLeft: 0 }, ['pump-invalid']],
    [{ mlLeft: 501 }, ['pump-invalid']],
    [{ mlLeft: 60.5 }, ['pump-invalid']],
    [{ mlLeft: 60, mlRight: Number.NaN }, ['pump-invalid']],
  ])('%o → %o', (amounts, expected) => {
    expect(
      validateEvent({ type: 'pump', babyId: null, startAt: NOW, ...amounts }, [], NOW),
    ).toEqual(expected);
  });
});

describe('validateEvent — growth', () => {
  const growth = (
    metrics: Partial<{ weightG: number; heightMm: number; headMm: number }>,
  ): EventDraft => ({
    type: 'growth',
    babyId: 'a',
    startAt: NOW,
    ...metrics,
  });

  it('needs at least one measurement', () => {
    expect(validateEvent(growth({}), [], NOW)).toEqual(['growth-empty']);
  });

  it('accepts whole grams and millimetres inside the ranges', () => {
    expect(validateEvent(growth({ weightG: 3450, heightMm: 525, headMm: 350 }), [], NOW)).toEqual(
      [],
    );
    expect(validateEvent(growth({ weightG: 300 }), [], NOW)).toEqual([]);
    expect(validateEvent(growth({ heightMm: 1300, headMm: 700 }), [], NOW)).toEqual([]);
  });

  it.each<[Partial<{ weightG: number; heightMm: number; headMm: number }>]>([
    [{ weightG: 299 }],
    [{ heightMm: 199 }],
    [{ heightMm: 1301 }],
    [{ headMm: 701 }],
    [{ headMm: 350.5 }],
    [{ weightG: Number.NaN }],
  ])('rejects %o', (metrics) => {
    expect(validateEvent(growth(metrics), [], NOW)).toEqual(['growth-invalid']);
  });

  it('a weight above 30 kg was probably typed in grams', () => {
    expect(validateEvent(growth({ weightG: 3_450_000 }), [], NOW)).toEqual(['weight-in-kg']);
  });
});

describe('validateEvent — temperature, medication and notes', () => {
  it.each([29.9, 45.1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s °C', (celsius) => {
    expect(
      validateEvent({ type: 'temperature', babyId: 'a', startAt: NOW, celsius }, [], NOW),
    ).toEqual(['temperature-invalid']);
  });

  it('accepts 30.0 to 45.0 °C', () => {
    expect(
      validateEvent({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 30 }, [], NOW),
    ).toEqual([]);
    expect(
      validateEvent({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 45 }, [], NOW),
    ).toEqual([]);
  });

  it('a medicine needs a name', () => {
    expect(
      validateEvent({ type: 'medication', babyId: 'a', startAt: NOW, name: '   ' }, [], NOW),
    ).toEqual(['medication-name-required']);
  });

  it('limits the length of names, doses and notes', () => {
    const medication = (name: string, dose?: string): EventDraft => ({
      type: 'medication',
      babyId: 'a',
      startAt: NOW,
      name,
      ...(dose === undefined ? {} : { dose }),
    });
    expect(validateEvent(medication('x'.repeat(60), 'y'.repeat(40)), [], NOW)).toEqual([]);
    expect(validateEvent(medication('x'.repeat(61)), [], NOW)).toEqual(['text-too-long']);
    expect(validateEvent(medication('D vitamini', 'y'.repeat(41)), [], NOW)).toEqual([
      'text-too-long',
    ]);
    const diaper = (note: string): EventDraft => ({
      type: 'diaper',
      babyId: 'a',
      startAt: NOW,
      wet: true,
      dirty: false,
      note,
    });
    expect(validateEvent(diaper('n'.repeat(500)), [], NOW)).toEqual([]);
    expect(validateEvent(diaper('n'.repeat(501)), [], NOW)).toEqual(['text-too-long']);
  });

  it('a health note needs text', () => {
    expect(validateEvent({ type: 'healthNote', babyId: 'a', startAt: NOW }, [], NOW)).toEqual([
      'note-required',
    ]);
    expect(
      validateEvent({ type: 'healthNote', babyId: 'a', startAt: NOW, note: '  ' }, [], NOW),
    ).toEqual(['note-required']);
    expect(
      validateEvent(
        { type: 'healthNote', babyId: 'a', startAt: NOW, note: 'Aşı yapıldı' },
        [],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('editedMinutesValid', () => {
  it('needs at least one side and whole minutes of 1 or more', () => {
    expect(editedMinutesValid([12, 1, 7])).toBe(true);
    expect(editedMinutesValid([])).toBe(false);
    expect(editedMinutesValid([12, 0])).toBe(false);
    expect(editedMinutesValid([7.5])).toBe(false);
    expect(editedMinutesValid([Number.NaN])).toBe(false);
  });
});

describe('ValidationError — babyIds', () => {
  it('names no baby by default and keeps the ones it is given', () => {
    expect(new ValidationError(['already-running']).babyIds).toEqual([]);
    expect(new ValidationError(['already-running'], ['a']).babyIds).toEqual(['a']);
  });
});

describe('validateMixName', () => {
  it('needs a name of at most 40 characters after trimming', () => {
    expect(validateMixName('Gece')).toEqual([]);
    expect(validateMixName('   ')).toEqual(['name-required']);
    expect(validateMixName(` ${'x'.repeat(MIX_NAME_MAX)} `)).toEqual([]);
    expect(validateMixName('x'.repeat(MIX_NAME_MAX + 1))).toEqual(['text-too-long']);
  });
});
