import { MINUTE } from '../../domain/time';
import type { BottleContents, Consistency, EventDraft, Id, Side, StoolColor } from '../../domain/types';

export type SheetKind = 'breastfeed' | 'bottle' | 'sleep' | 'diaper';

export interface BreastfeedInput { side: Side; durationMin: number | null }
export interface BottleInput { ml: number | null; contents: BottleContents }
export interface SleepInput { durationMin: number | null }
export interface DiaperInput { wet: boolean; dirty: boolean; stoolColor: StoolColor | null; consistency: Consistency | null }

export type SheetInput =
  | { kind: 'breastfeed'; value: BreastfeedInput }
  | { kind: 'bottle'; value: BottleInput }
  | { kind: 'sleep'; value: SleepInput }
  | { kind: 'diaper'; value: DiaperInput };

export const DEFAULT_INPUTS = {
  breastfeed: { side: 'L', durationMin: null } as BreastfeedInput,
  bottle: { ml: null, contents: 'breastmilk' } as BottleInput,
  sleep: { durationMin: null } as SleepInput,
  diaper: { wet: true, dirty: false, stoolColor: null, consistency: null } as DiaperInput,
};

/**
 * Turns one sheet submission into one draft per selected baby. Validation happens in the repository.
 * `at` is the time from the sheet: a timer STARTS at `at`; an entry with a duration ENDS at `at`
 * ("fed 15 min, just finished"); instant entries (bottle, diaper) happen at `at`.
 */
export function buildDrafts(input: SheetInput, babyIds: readonly Id[], at: number): EventDraft[] {
  return babyIds.map((babyId): EventDraft => {
    switch (input.kind) {
      case 'breastfeed': {
        const { side, durationMin } = input.value;
        if (durationMin === null) return { type: 'breastfeed', babyId, startAt: at, segments: [{ side, start: at }] };
        const startAt = at - durationMin * MINUTE;
        return { type: 'breastfeed', babyId, startAt, endAt: at, segments: [{ side, start: startAt, end: at }] };
      }
      case 'bottle':
        return { type: 'bottle', babyId, startAt: at, ml: input.value.ml ?? 0, contents: input.value.contents };
      case 'sleep': {
        const { durationMin } = input.value;
        return durationMin === null
          ? { type: 'sleep', babyId, startAt: at }
          : { type: 'sleep', babyId, startAt: at - durationMin * MINUTE, endAt: at };
      }
      case 'diaper': {
        const { wet, dirty, stoolColor, consistency } = input.value;
        return {
          type: 'diaper',
          babyId,
          startAt: at,
          wet,
          dirty,
          ...(dirty && stoolColor ? { stoolColor } : {}),
          ...(dirty && consistency ? { consistency } : {}),
        };
      }
    }
  });
}
