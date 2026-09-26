import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../src/domain/time';
import {
  DEFAULT_INPUTS,
  buildDrafts,
  initialInput,
  resolveEntryTime,
} from '../../src/ui/log/drafts';

const AT = new Date(2026, 8, 25, 8, 0).getTime();

describe('buildDrafts', () => {
  it('breastfeed without a duration starts a timer on the chosen side', () => {
    expect(
      buildDrafts({ kind: 'breastfeed', value: { side: 'R', durationMin: null } }, ['a'], AT),
    ).toEqual([
      { type: 'breastfeed', babyId: 'a', startAt: AT, segments: [{ side: 'R', start: AT }] },
    ]);
  });

  it('breastfeed with a duration is a finished feed that ENDS at the chosen time', () => {
    const start = AT - 15 * MINUTE;
    expect(
      buildDrafts({ kind: 'breastfeed', value: { side: 'L', durationMin: 15 } }, ['a'], AT),
    ).toEqual([
      {
        type: 'breastfeed',
        babyId: 'a',
        startAt: start,
        endAt: AT,
        segments: [{ side: 'L', start, end: AT }],
      },
    ]);
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

describe('buildDrafts — the "Diğer" types', () => {
  it('pumping is one entry for the parent, whichever babies are selected', () => {
    expect(
      buildDrafts({ kind: 'pump', value: { mlLeft: '60', mlRight: '' } }, ['a', 'b'], AT),
    ).toStrictEqual([{ type: 'pump', babyId: null, startAt: AT, mlLeft: 60 }]);
  });

  it('a pump amount that is not a whole number becomes NaN, so validation reports it', () => {
    expect(
      buildDrafts({ kind: 'pump', value: { mlLeft: '60.5', mlRight: ' 40 ' } }, [], AT)[0],
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
      buildDrafts({ kind: 'medication', value: { name: '  D vitamini ', dose: ' ' } }, ['a'], AT),
    ).toStrictEqual([{ type: 'medication', babyId: 'a', startAt: AT, name: 'D vitamini' }]);
  });

  it('a note goes on every entry, and a blank one is left out', () => {
    expect(
      buildDrafts({ kind: 'healthNote', value: {} }, ['a', 'b'], AT, 'Aşı günü'),
    ).toStrictEqual([
      { type: 'healthNote', babyId: 'a', startAt: AT, note: 'Aşı günü' },
      { type: 'healthNote', babyId: 'b', startAt: AT, note: 'Aşı günü' },
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
    expect(initialInput('pump')).toEqual({ kind: 'pump', value: { mlLeft: '', mlRight: '' } });
  });
});

describe('resolveEntryTime', () => {
  const NOW = new Date(2026, 8, 25, 8, 17, 42, 123).getTime();

  it('null means "now": the exact current instant, seconds and all, never a parsed minute', () => {
    expect(resolveEntryTime(null, NOW)).toBe(NOW);
  });

  it('a time the user picked is used as is', () => {
    expect(resolveEntryTime(AT, NOW)).toBe(AT);
  });
});
