import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../src/domain/time';
import { DEFAULT_INPUTS, buildDrafts } from '../../src/ui/log/drafts';

const AT = new Date(2026, 8, 25, 8, 0).getTime();

describe('buildDrafts', () => {
  it('breastfeed without a duration starts a timer on the chosen side', () => {
    expect(buildDrafts({ kind: 'breastfeed', value: { side: 'R', durationMin: null } }, ['a'], AT)).toEqual([
      { type: 'breastfeed', babyId: 'a', startAt: AT, segments: [{ side: 'R', start: AT }] },
    ]);
  });

  it('breastfeed with a duration is a finished feed that ENDS at the chosen time', () => {
    const start = AT - 15 * MINUTE;
    expect(buildDrafts({ kind: 'breastfeed', value: { side: 'L', durationMin: 15 } }, ['a'], AT)).toEqual([
      { type: 'breastfeed', babyId: 'a', startAt: start, endAt: AT, segments: [{ side: 'L', start, end: AT }] },
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
    expect(buildDrafts({ kind: 'bottle', value: { ml: 90, contents: 'formula' } }, ['a'], AT)).toEqual([
      { type: 'bottle', babyId: 'a', startAt: AT, ml: 90, contents: 'formula' },
    ]);
    expect(buildDrafts({ kind: 'bottle', value: { ml: null, contents: 'formula' } }, ['a'], AT)[0]).toMatchObject({ ml: 0 });
  });

  it('diaper keeps stool details only when dirty', () => {
    expect(
      buildDrafts({ kind: 'diaper', value: { wet: true, dirty: false, stoolColor: 'white', consistency: 'soft' } }, ['a'], AT),
    ).toEqual([{ type: 'diaper', babyId: 'a', startAt: AT, wet: true, dirty: false }]);
    expect(
      buildDrafts({ kind: 'diaper', value: { wet: false, dirty: true, stoolColor: 'yellow', consistency: 'soft' } }, ['a'], AT),
    ).toEqual([{ type: 'diaper', babyId: 'a', startAt: AT, wet: false, dirty: true, stoolColor: 'yellow', consistency: 'soft' }]);
  });

  it('creates one draft per selected baby', () => {
    const drafts = buildDrafts({ kind: 'diaper', value: DEFAULT_INPUTS.diaper }, ['a', 'b'], AT);
    expect(drafts.map((d) => d.babyId)).toEqual(['a', 'b']);
  });
});
