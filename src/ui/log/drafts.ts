import { parseDecimal, scaleToInt } from '../../domain/decimal';
import { pumpStartAt } from '../../domain/pump';
import { MINUTE } from '../../domain/time';
import type {
  BottleContents,
  Consistency,
  EventDraft,
  Id,
  Side,
  StoolColor,
} from '../../domain/types';

/** What a quick button opens. "other" is the "Other" sheet (quick.other), whose chip picks one of OTHER_TYPES. */
export type SheetKind = 'breastfeed' | 'bottle' | 'sleep' | 'diaper' | 'other';

/** What opens a log sheet: a card action (for that baby) or the standalone pumping button (the parent's, no baby). */
export type LogRequest = { kind: SheetKind; babyId: Id } | { kind: 'pump' };

/** The record types of the "Other" sheet (quick.other) in chip order. The first is the default: daily vitamin D. */
export type OtherType = 'medication' | 'growth' | 'temperature' | 'healthNote';
export const OTHER_TYPES: readonly OtherType[] = [
  'medication',
  'growth',
  'temperature',
  'healthNote',
];

export interface BreastfeedInput {
  side: Side;
  durationMin: number | null;
}
export interface BottleInput {
  ml: number | null;
  contents: BottleContents;
}
export interface SleepInput {
  durationMin: number | null;
}
export interface DiaperInput {
  wet: boolean;
  dirty: boolean;
  stoolColor: StoolColor | null;
  consistency: Consistency | null;
}
/**
 * Whole minutes per side (null: side not used), and whole millilitres exactly as typed; the ml are parsed
 * on save, so "60.5" is reported instead of truncated.
 */
export interface PumpInput {
  minLeft: number | null;
  minRight: number | null;
  mlLeft: string;
  mlRight: string;
}
/** Decimal text exactly as typed ("3,45"). Parsed on save, so a typo is reported instead of silently dropped. */
export interface GrowthInput {
  weightKg: string;
  heightCm: string;
  headCm: string;
}
export interface TemperatureInput {
  celsius: string;
}
export interface MedicationInput {
  name: string;
  dose: string;
}
export type HealthNoteInput = Record<string, never>;

export type SheetInput =
  | { kind: 'breastfeed'; value: BreastfeedInput }
  | { kind: 'bottle'; value: BottleInput }
  | { kind: 'sleep'; value: SleepInput }
  | { kind: 'diaper'; value: DiaperInput }
  | { kind: 'pump'; value: PumpInput }
  | { kind: 'growth'; value: GrowthInput }
  | { kind: 'temperature'; value: TemperatureInput }
  | { kind: 'medication'; value: MedicationInput }
  | { kind: 'healthNote'; value: HealthNoteInput };

export type InputKind = SheetInput['kind'];
export type InputValue<K extends InputKind> = Extract<SheetInput, { kind: K }>['value'];

export const DEFAULT_INPUTS: { [K in InputKind]: InputValue<K> } = {
  breastfeed: { side: 'L', durationMin: null },
  bottle: { ml: null, contents: 'breastmilk' },
  sleep: { durationMin: null },
  diaper: { wet: true, dirty: false, stoolColor: null, consistency: null },
  pump: { minLeft: null, minRight: null, mlLeft: '', mlRight: '' },
  growth: { weightKg: '', heightCm: '', headCm: '' },
  temperature: { celsius: '' },
  medication: { name: '', dose: '' },
  healthNote: {},
};

export function initialInput(kind: InputKind): SheetInput {
  return { kind, value: DEFAULT_INPUTS[kind] } as SheetInput;
}

/** A note is stored as typed; an empty or whitespace-only one is left out. */
export function noteField(note: string): { note?: string } {
  return note.trim() === '' ? {} : { note };
}

/** '' → no key; text that does not parse → NaN (so validation reports it); otherwise value × factor, rounded. */
function decimalField<K extends string>(
  key: K,
  raw: string,
  factor: number,
): Partial<Record<K, number>> {
  if (raw.trim() === '') return {};
  const value = parseDecimal(raw);
  return { [key]: value === null ? Number.NaN : scaleToInt(value, factor) } as Partial<
    Record<K, number>
  >;
}

/** '' → no key; anything but digits → NaN (so validation reports it); otherwise the whole number. */
function amountField<K extends string>(key: K, raw: string): Partial<Record<K, number>> {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  return { [key]: /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN } as Partial<
    Record<K, number>
  >;
}

/** The minutes and ml a pump input holds, without the empty ones. */
export function pumpAmounts(value: PumpInput): {
  minLeft?: number;
  minRight?: number;
  mlLeft?: number;
  mlRight?: number;
} {
  return {
    ...(value.minLeft === null ? {} : { minLeft: value.minLeft }),
    ...(value.minRight === null ? {} : { minRight: value.minRight }),
    ...amountField('mlLeft', value.mlLeft),
    ...amountField('mlRight', value.mlRight),
  };
}

/** °C rounded to one decimal before validation, so 37,95 becomes 38,0 and gets the fever hint. */
function temperatureValue(raw: string): number {
  const value = parseDecimal(raw);
  return value === null ? Number.NaN : scaleToInt(value, 10) / 10;
}

function draftFor(input: SheetInput, babyId: Id | null, at: number): EventDraft {
  switch (input.kind) {
    case 'breastfeed': {
      const { side, durationMin } = input.value;
      if (durationMin === null)
        return { type: 'breastfeed', babyId, startAt: at, segments: [{ side, start: at }] };
      const startAt = at - durationMin * MINUTE;
      return {
        type: 'breastfeed',
        babyId,
        startAt,
        endAt: at,
        segments: [{ side, start: startAt, end: at }],
      };
    }
    case 'bottle':
      return {
        type: 'bottle',
        babyId,
        startAt: at,
        ml: input.value.ml ?? 0,
        contents: input.value.contents,
      };
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
    case 'pump': {
      const amounts = pumpAmounts(input.value);
      return {
        type: 'pump',
        babyId: null,
        startAt: pumpStartAt(at, amounts.minLeft, amounts.minRight),
        endAt: at,
        ...amounts,
      };
    }
    case 'growth':
      return {
        type: 'growth',
        babyId,
        startAt: at,
        ...decimalField('weightG', input.value.weightKg, 1000),
        ...decimalField('heightMm', input.value.heightCm, 10),
        ...decimalField('headMm', input.value.headCm, 10),
      };
    case 'temperature':
      return {
        type: 'temperature',
        babyId,
        startAt: at,
        celsius: temperatureValue(input.value.celsius),
      };
    case 'medication': {
      const dose = input.value.dose.trim();
      return {
        type: 'medication',
        babyId,
        startAt: at,
        name: input.value.name.trim(),
        ...(dose === '' ? {} : { dose }),
      };
    }
    case 'healthNote':
      return { type: 'healthNote', babyId, startAt: at };
  }
}

/**
 * Turns one sheet submission into drafts: one per selected baby, except pumping, which is a single entry
 * for the parent (`babyId: null`). Validation happens in the repository. `at` is the time from the sheet:
 * a timer STARTS at `at`; an entry with a duration ENDS at `at` ("fed 15 min, just finished", a pump
 * logged afterwards); instant entries happen at `at`.
 */
export function buildDrafts(
  input: SheetInput,
  babyIds: readonly Id[],
  at: number,
  note = '',
): EventDraft[] {
  const extra = noteField(note);
  if (input.kind === 'pump') return [{ ...draftFor(input, null, at), ...extra }];
  return babyIds.map((babyId) => ({ ...draftFor(input, babyId, at), ...extra }));
}
