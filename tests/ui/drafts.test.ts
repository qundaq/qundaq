import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../src/domain/time';
import {
  DEFAULT_INPUTS,
  buildDrafts,
  feedSegments,
  hasFeedMinutes,
  hasPumpAmounts,
  initialInput,
} from '../../src/ui/log/drafts';

const AT = new Date(2026, 8, 25, 8, 0).getTime();

describe('buildDrafts', () => {
  it('a side button starts a feed timer on that side at the chosen start', () => {
    expect(buildDrafts({ kind: 'breastfeed', value: { timer: 'R' } }, ['a'], AT)).toEqual([
      { type: 'breastfeed', babyId: 'a', startAt: AT, segments: [{ side: 'R', start: AT }] },
    ]);
  });

  it('a feed logged afterwards with one side is one segment that ENDS at the chosen time', () => {
    const start = AT - 15 * MINUTE;
    const finished = {
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      endAt: AT,
      segments: [{ side: 'R', start, end: AT }],
    };
    expect(
      buildDrafts({ kind: 'breastfeed', value: { minLeft: null, minRight: 15 } }, ['a'], AT),
    ).toEqual([finished]);
    // 0 minutes counts as "not used", like an empty side.
    expect(
      buildDrafts({ kind: 'breastfeed', value: { minLeft: 0, minRight: 15 } }, ['a'], AT),
    ).toEqual([finished]);
  });

  it('a feed logged afterwards with both sides: left first, then right, ending at the chosen time', () => {
    const start = AT - 15 * MINUTE;
    expect(
      buildDrafts({ kind: 'breastfeed', value: { minLeft: 10, minRight: 5 } }, ['a'], AT),
    ).toEqual([
      {
        type: 'breastfeed',
        babyId: 'a',
        startAt: start,
        endAt: AT,
        segments: [
          { side: 'L', start, end: start + 10 * MINUTE },
          { side: 'R', start: start + 10 * MINUTE, end: AT },
        ],
      },
    ]);
  });

  it('a feed with no minutes builds no segments (validation refuses it; the sheet never saves it)', () => {
    expect(feedSegments(AT, null, null)).toEqual({ startAt: AT, endAt: AT, segments: [] });
    expect(hasFeedMinutes({ minLeft: null, minRight: null })).toBe(false);
    expect(hasFeedMinutes({ minLeft: 0, minRight: null })).toBe(false);
    expect(hasFeedMinutes({ minLeft: null, minRight: 5 })).toBe(true);
    expect(hasFeedMinutes({ timer: 'L' })).toBe(false);
  });

  it('sleep: timer or finished', () => {
    expect(buildDrafts({ kind: 'sleep', value: { durationMin: null } }, ['a'], AT)).toEqual([
      { type: 'sleep', babyId: 'a', startAt: AT },
    ]);
    expect(buildDrafts({ kind: 'sleep', value: { durationMin: 90 } }, ['a'], AT)).toEqual([
      { type: 'sleep', babyId: 'a', startAt: AT - 90 * MINUTE, endAt: AT },
    ]);
  });

  it('bottle passes the amount through (a missing amount becomes 0 and fails validation later)', () => {
    expect(
      buildDrafts({ kind: 'bottle', value: { ml: 90, contents: 'formula' } }, ['a'], AT),
    ).toEqual([{ type: 'bottle', babyId: 'a', startAt: AT, ml: 90, contents: 'formula' }]);
    expect(
      buildDrafts({ kind: 'bottle', value: { ml: null, contents: 'formula' } }, ['a'], AT)[0],
    ).toMatchObject({ ml: 0 });
  });

  it('diaper keeps stool details only when dirty', () => {
    expect(
      buildDrafts(
        {
          kind: 'diaper',
          value: { wet: true, dirty: false, stoolColor: 'white', consistency: 'soft' },
        },
        ['a'],
        AT,
      ),
    ).toEqual([{ type: 'diaper', babyId: 'a', startAt: AT, wet: true, dirty: false }]);
    expect(
      buildDrafts(
        {
          kind: 'diaper',
          value: { wet: false, dirty: true, stoolColor: 'yellow', consistency: 'soft' },
        },
        ['a'],
        AT,
      ),
    ).toEqual([
      {
        type: 'diaper',
        babyId: 'a',
        startAt: AT,
        wet: false,
        dirty: true,
        stoolColor: 'yellow',
        consistency: 'soft',
      },
    ]);
  });

  it('creates one draft per selected baby', () => {
    const drafts = buildDrafts({ kind: 'diaper', value: DEFAULT_INPUTS.diaper }, ['a', 'b'], AT);
    expect(drafts.map((d) => d.babyId)).toEqual(['a', 'b']);
  });
});

describe('buildDrafts — the "Other" types (quick.other)', () => {
  const NO_PUMP = { minLeft: null, minRight: null, mlLeft: '', mlRight: '' };

  it('pumping is one entry for the parent, whichever babies are selected; ml only is a moment', () => {
    expect(
      buildDrafts({ kind: 'pump', value: { ...NO_PUMP, mlLeft: '60' } }, ['a', 'b'], AT),
    ).toStrictEqual([{ type: 'pump', babyId: null, startAt: AT, endAt: AT, mlLeft: 60 }]);
  });

  it('a baby-less pump request builds the same single parent entry', () => {
    expect(
      buildDrafts({ kind: 'pump', value: { ...NO_PUMP, mlRight: '80' } }, [], AT, 'evening'),
    ).toStrictEqual([
      { type: 'pump', babyId: null, startAt: AT, endAt: AT, mlRight: 80, note: 'evening' },
    ]);
  });

  it('a pump with minutes ENDS at the chosen time and began the sum of the minutes earlier', () => {
    expect(
      buildDrafts(
        { kind: 'pump', value: { minLeft: 12, minRight: 10, mlLeft: '', mlRight: '40' } },
        [],
        AT,
      ),
    ).toStrictEqual([
      {
        type: 'pump',
        babyId: null,
        startAt: AT - 22 * MINUTE,
        endAt: AT,
        minLeft: 12,
        minRight: 10,
        mlRight: 40,
      },
    ]);
    expect(
      buildDrafts({ kind: 'pump', value: { ...NO_PUMP, minRight: 15 } }, [], AT)[0],
    ).toStrictEqual({
      type: 'pump',
      babyId: null,
      startAt: AT - 15 * MINUTE,
      endAt: AT,
      minRight: 15,
    });
  });

  it('a pump has something to save once a side has minutes or ml typed', () => {
    expect(hasPumpAmounts(NO_PUMP)).toBe(false);
    expect(hasPumpAmounts({ ...NO_PUMP, mlLeft: '  ' })).toBe(false);
    expect(hasPumpAmounts({ ...NO_PUMP, minRight: 10 })).toBe(true);
    expect(hasPumpAmounts({ ...NO_PUMP, mlRight: '40' })).toBe(true);
    expect(hasPumpAmounts({ ...NO_PUMP, minLeft: 5, mlLeft: '60' })).toBe(true);
  });

  it('a negative pump amount becomes NaN, so validation reports it', () => {
    expect(
      buildDrafts({ kind: 'pump', value: { ...NO_PUMP, mlLeft: '-5' } }, [], AT)[0],
    ).toMatchObject({ mlLeft: Number.NaN });
  });

  it('a pump amount that is not a whole number becomes NaN, so validation reports it', () => {
    expect(
      buildDrafts(
        { kind: 'pump', value: { ...NO_PUMP, mlLeft: '60.5', mlRight: ' 40 ' } },
        [],
        AT,
      )[0],
    ).toMatchObject({
      mlLeft: Number.NaN,
      mlRight: 40,
    });
  });

  it('growth converts kg and cm with either separator and leaves empty fields out', () => {
    expect(
      buildDrafts(
        { kind: 'growth', value: { weightKg: '3,45', heightCm: '52.5', headCm: '' } },
        ['a'],
        AT,
      ),
    ).toStrictEqual([{ type: 'growth', babyId: 'a', startAt: AT, weightG: 3450, heightMm: 525 }]);
  });

  it('a growth value that is not a number becomes NaN, so validation reports it', () => {
    expect(
      buildDrafts(
        { kind: 'growth', value: { weightKg: '3,4,5', heightCm: '', headCm: '' } },
        ['a'],
        AT,
      )[0],
    ).toMatchObject({
      weightG: Number.NaN,
    });
  });

  it('temperature is rounded to 0.1 °C before validation (37,95 → 38)', () => {
    expect(
      buildDrafts({ kind: 'temperature', value: { celsius: '37,95' } }, ['a'], AT)[0],
    ).toMatchObject({ celsius: 38 });
    expect(
      buildDrafts({ kind: 'temperature', value: { celsius: '' } }, ['a'], AT)[0],
    ).toMatchObject({ celsius: Number.NaN });
  });

  it('medication trims the name and leaves an empty dose out', () => {
    expect(
      buildDrafts({ kind: 'medication', value: { name: '  Vitamin D ', dose: ' ' } }, ['a'], AT),
    ).toStrictEqual([{ type: 'medication', babyId: 'a', startAt: AT, name: 'Vitamin D' }]);
  });

  it('a note goes on every entry, and a blank one is left out', () => {
    expect(
      buildDrafts({ kind: 'healthNote', value: {} }, ['a', 'b'], AT, 'Vaccine day'),
    ).toStrictEqual([
      { type: 'healthNote', babyId: 'a', startAt: AT, note: 'Vaccine day' },
      { type: 'healthNote', babyId: 'b', startAt: AT, note: 'Vaccine day' },
    ]);
    expect(
      buildDrafts({ kind: 'diaper', value: DEFAULT_INPUTS.diaper }, ['a'], AT, '   '),
    ).toStrictEqual([{ type: 'diaper', babyId: 'a', startAt: AT, wet: true, dirty: false }]);
  });

  it('initialInput starts every kind empty', () => {
    expect(initialInput('growth')).toEqual({
      kind: 'growth',
      value: { weightKg: '', heightCm: '', headCm: '' },
    });
    expect(initialInput('medication')).toEqual({
      kind: 'medication',
      value: { name: '', dose: '' },
    });
    expect(initialInput('pump')).toEqual({
      kind: 'pump',
      value: { minLeft: null, minRight: null, mlLeft: '', mlRight: '' },
    });
  });
});
