import { parseDecimal, scaleToInt } from '../../domain/decimal';
import { ValidationError, editedMinutesValid } from '../../domain/rules';
import { MINUTE, fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import type {
  BottleContents,
  BreastSegment,
  Consistency,
  EventDraft,
  Id,
  Side,
  StoolColor,
  TrackerEvent,
} from '../../domain/types';
import type { Locale } from '../../i18n';

/** What a quick button opens. "other" is the "Diğer" sheet, whose chip picks one of OTHER_TYPES. */
export type SheetKind = 'breastfeed' | 'bottle' | 'sleep' | 'diaper' | 'other';

/** The record types of the "Diğer" sheet in chip order. The first is the default: daily vitamin D. */
export type OtherType = 'medication' | 'growth' | 'temperature' | 'pump' | 'healthNote';
export const OTHER_TYPES: readonly OtherType[] = [
  'medication',
  'growth',
  'temperature',
  'pump',
  'healthNote',
];
export const DEFAULT_OTHER_TYPE: OtherType = 'medication';

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
/** Whole millilitres exactly as typed; parsed on save, so "60.5" is reported instead of truncated. */
export interface PumpInput {
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
type InputValue<K extends InputKind> = Extract<SheetInput, { kind: K }>['value'];

export const DEFAULT_INPUTS: { [K in InputKind]: InputValue<K> } = {
  breastfeed: { side: 'L', durationMin: null },
  bottle: { ml: null, contents: 'breastmilk' },
  sleep: { durationMin: null },
  diaper: { wet: true, dirty: false, stoolColor: null, consistency: null },
  pump: { mlLeft: '', mlRight: '' },
  growth: { weightKg: '', heightCm: '', headCm: '' },
  temperature: { celsius: '' },
  medication: { name: '', dose: '' },
  healthNote: {},
};

export function initialInput(kind: InputKind): SheetInput {
  return { kind, value: DEFAULT_INPUTS[kind] } as SheetInput;
}

/** The sheet's time: `null` means "now", the moment of saving, never a value parsed back from the field. */
export function resolveEntryTime(value: number | null, now: number): number {
  return value ?? now;
}

/** A note is stored as typed; an empty or whitespace-only one is left out. */
function noteField(note: string): { note?: string } {
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
    case 'pump':
      return {
        type: 'pump',
        babyId: null,
        startAt: at,
        ...amountField('mlLeft', input.value.mlLeft),
        ...amountField('mlRight', input.value.mlRight),
      };
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
 * a timer STARTS at `at`; an entry with a duration ENDS at `at` ("fed 15 min, just finished"); instant
 * entries happen at `at`.
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

// ---------------------------------------------------------------------------------------------------
// The edit sheet. Every time is held as the stored epoch ms and replaced only by a real new value, so
// `inputToDraft(eventToInput(e))` gives back e's draft exactly: same ms, same keys.

export type DecimalSeparator = '.' | ',';

export function decimalSeparatorFor(locale: Locale): DecimalSeparator {
  return locale === 'tr' ? ',' : '.';
}

export interface EditSegment {
  side: Side;
  minutes: number; // shown and edited; 0 for the open (running) side and for a new, still empty row
}

export interface SleepEdit {
  type: 'sleep';
  babyId: Id;
  startAt: number;
  endAt: number | null; // null: running
  note: string;
}

export interface BreastfeedEdit {
  type: 'breastfeed';
  babyId: Id;
  startAt: number;
  endAt: number | null; // finished: the stored end; running: null unless an end was chosen
  running: boolean; // the stored feed has no end; decides the mapping whatever the segments look like
  segments: EditSegment[];
  original: BreastSegment[]; // the stored segments, used as they are (shifted) while the rows match them
  originalStartAt: number; // the stored start, to shift `original` by the start-time delta
  note: string;
}

export type InstantType = Exclude<InputKind, 'sleep' | 'breastfeed'>;
export type InstantEdit = {
  [K in InstantType]: {
    type: K;
    babyId: Id | null;
    startAt: number;
    value: InputValue<K>;
    note: string;
  };
}[InstantType];

export type EditInput = SleepEdit | BreastfeedEdit | InstantEdit;

/** Minutes shown for a side: rounded, never 0, so a 20-second side reads "1". */
export function segmentMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / MINUTE));
}

/** The rows the edit sheet shows for stored segments; 0 minutes for the open (running) side. */
function shownSegments(original: readonly BreastSegment[]): EditSegment[] {
  return original.map((segment) => ({
    side: segment.side,
    minutes: segment.end === undefined ? 0 : segmentMinutes(segment.end - segment.start),
  }));
}

/**
 * True when the rows differ from the stored sides. Derived rather than stored, so an edit that is undone
 * (a side added and removed, a chip tapped away and back) keeps the exact stored timing.
 */
export function segmentsChanged(input: BreastfeedEdit): boolean {
  const shown = shownSegments(input.original);
  return (
    input.segments.length !== shown.length ||
    input.segments.some(
      (segment, i) => segment.side !== shown[i]!.side || segment.minutes !== shown[i]!.minutes,
    )
  );
}

function decimalText(
  value: number | undefined,
  divisor: number,
  decimal: DecimalSeparator,
): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(value / divisor).replace('.', decimal);
}

export function eventToInput(event: TrackerEvent, decimal: DecimalSeparator = '.'): EditInput {
  const note = event.note ?? '';
  switch (event.type) {
    case 'sleep':
      return {
        type: 'sleep',
        babyId: event.babyId as Id,
        startAt: event.startAt,
        endAt: event.endAt ?? null,
        note,
      };
    case 'breastfeed': {
      const original = (event.segments ?? []).map((segment) => ({ ...segment }));
      return {
        type: 'breastfeed',
        babyId: event.babyId as Id,
        startAt: event.startAt,
        endAt: event.endAt ?? null,
        running: event.endAt === undefined,
        segments: shownSegments(original),
        original,
        originalStartAt: event.startAt,
        note,
      };
    }
    case 'bottle':
      return {
        type: 'bottle',
        babyId: event.babyId,
        startAt: event.startAt,
        value: { ml: event.ml, contents: event.contents },
        note,
      };
    case 'diaper':
      return {
        type: 'diaper',
        babyId: event.babyId,
        startAt: event.startAt,
        value: {
          wet: event.wet,
          dirty: event.dirty,
          stoolColor: event.stoolColor ?? null,
          consistency: event.consistency ?? null,
        },
        note,
      };
    case 'pump':
      return {
        type: 'pump',
        babyId: event.babyId,
        startAt: event.startAt,
        value: {
          mlLeft: event.mlLeft === undefined ? '' : String(event.mlLeft),
          mlRight: event.mlRight === undefined ? '' : String(event.mlRight),
        },
        note,
      };
    case 'growth':
      return {
        type: 'growth',
        babyId: event.babyId,
        startAt: event.startAt,
        value: {
          weightKg: decimalText(event.weightG, 1000, decimal),
          heightCm: decimalText(event.heightMm, 10, decimal),
          headCm: decimalText(event.headMm, 10, decimal),
        },
        note,
      };
    case 'temperature':
      return {
        type: 'temperature',
        babyId: event.babyId,
        startAt: event.startAt,
        value: { celsius: decimalText(event.celsius, 1, decimal) },
        note,
      };
    case 'medication':
      return {
        type: 'medication',
        babyId: event.babyId,
        startAt: event.startAt,
        value: { name: event.name, dose: event.dose ?? '' },
        note,
      };
    case 'healthNote':
      return { type: 'healthNote', babyId: event.babyId, startAt: event.startAt, value: {}, note };
  }
}

function breastfeedTiming(input: BreastfeedEdit): {
  startAt: number;
  endAt?: number;
  segments: BreastSegment[];
} {
  const { startAt, endAt, original } = input;
  const delta = startAt - input.originalStartAt;
  const last = original.length - 1;
  if (input.running) {
    // Running: the first side moves with the start, the current side may have been corrected, and a
    // chosen end closes it. Nothing else changes.
    const side = input.segments[last]?.side;
    const segments = original.map((segment, i) => {
      const moved = i === 0 ? { ...segment, start: segment.start + delta } : { ...segment };
      if (i !== last) return moved;
      return {
        ...moved,
        ...(side === undefined ? {} : { side }),
        ...(endAt === null ? {} : { end: endAt }),
      };
    });
    return endAt === null ? { startAt, segments } : { startAt, endAt, segments };
  }
  if (!segmentsChanged(input)) {
    // Untouched sides keep their exact timing, pauses and seconds included, shifted with the start.
    const segments = original.map((segment) => ({
      ...segment,
      start: segment.start + delta,
      ...(segment.end === undefined ? {} : { end: segment.end + delta }),
    }));
    return endAt === null ? { startAt, segments } : { startAt, endAt: endAt + delta, segments };
  }
  // Edited sides are laid back to back from the start; the feed ends where the last one does.
  if (!editedMinutesValid(input.segments.map((segment) => segment.minutes)))
    throw new ValidationError(['segments-invalid']);
  let cursor = startAt;
  const segments = input.segments.map((segment) => {
    const laid = { side: segment.side, start: cursor, end: cursor + segment.minutes * MINUTE };
    cursor = laid.end;
    return laid;
  });
  return { startAt, endAt: cursor, segments };
}

/** The draft to save from the edit sheet. Throws ValidationError(['segments-invalid']) for bad minutes. */
export function inputToDraft(input: EditInput): EventDraft {
  switch (input.type) {
    case 'sleep':
      return {
        type: 'sleep',
        babyId: input.babyId,
        startAt: input.startAt,
        ...(input.endAt === null ? {} : { endAt: input.endAt }),
        ...noteField(input.note),
      };
    case 'breastfeed':
      return {
        type: 'breastfeed',
        babyId: input.babyId,
        ...breastfeedTiming(input),
        ...noteField(input.note),
      };
    default:
      return buildDrafts(
        { kind: input.type, value: input.value } as SheetInput,
        [input.babyId as Id],
        input.startAt,
        input.note,
      )[0]!;
  }
}

export function setSegmentSide(input: BreastfeedEdit, index: number, side: Side): BreastfeedEdit {
  return {
    ...input,
    segments: input.segments.map((segment, i) => (i === index ? { ...segment, side } : segment)),
  };
}

export function setSegmentMinutes(
  input: BreastfeedEdit,
  index: number,
  minutes: number,
): BreastfeedEdit {
  return {
    ...input,
    segments: input.segments.map((segment, i) => (i === index ? { ...segment, minutes } : segment)),
  };
}

/** Adds an empty row on the other side from the last one. */
export function addSegment(input: BreastfeedEdit): BreastfeedEdit {
  const last = input.segments.at(-1);
  const side: Side = last?.side === 'L' ? 'R' : 'L';
  return { ...input, segments: [...input.segments, { side, minutes: 0 }] };
}

/** Removes a row; the last remaining row stays. */
export function removeSegment(input: BreastfeedEdit, index: number): BreastfeedEdit {
  if (input.segments.length <= 1) return input;
  return { ...input, segments: input.segments.filter((_, i) => i !== index) };
}

/**
 * The edit sheet's time fields: the shown value unchanged keeps the current instant (seconds included); a
 * value that shows the `stored` time again (a minute changed and changed back) returns exactly the stored
 * instant, so the form is no longer dirty; a new value that parses replaces it; an emptied or broken value
 * keeps it. The edit sheet never means "now".
 */
export function editedTime(raw: string, current: number, stored?: number): number {
  if (stored !== undefined && raw === toLocalInputValue(stored)) return stored;
  if (raw === toLocalInputValue(current)) return current;
  return fromLocalInputValue(raw) ?? current;
}

/** Like editedTime, for the optional end of a running timer: an emptied field means "no end". */
export function editedOptionalTime(raw: string, current: number | null): number | null {
  if (raw === '') return null;
  if (current !== null && raw === toLocalInputValue(current)) return current;
  return fromLocalInputValue(raw) ?? current;
}
