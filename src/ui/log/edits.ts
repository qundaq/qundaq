import { ValidationError, editedMinutesValid } from '../../domain/rules';
import { MINUTE, fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import type { BreastSegment, EventDraft, Id, Side, TrackerEvent } from '../../domain/types';
import type { Locale } from '../../i18n';
import { buildDrafts, noteField, type InputKind, type InputValue, type SheetInput } from './drafts';

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
