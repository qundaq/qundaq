import { HOUR, MINUTE } from './time';
import type { BreastSegment, EventDraft, EventType, Id, TrackerEvent } from './types';

export type RuleViolation =
  | 'baby-required'
  | 'in-future'
  | 'end-before-start'
  | 'already-running'
  | 'running-overlap'
  | 'segments-invalid'
  | 'amount-invalid'
  | 'diaper-empty'
  | 'name-required'
  | 'too-long'
  | 'pump-empty'
  | 'pump-invalid'
  | 'growth-empty'
  | 'growth-invalid'
  | 'weight-in-kg'
  | 'temperature-invalid'
  | 'medication-name-required'
  | 'note-required'
  | 'text-too-long'
  | 'mix-layers-invalid';

export class ValidationError extends Error {
  readonly violations: readonly RuleViolation[];
  /** The babies whose drafts caused 'already-running', so the UI can name them. */
  readonly babyIds: readonly Id[];

  constructor(violations: readonly RuleViolation[], babyIds: readonly Id[] = []) {
    super(`Validation failed: ${violations.join(', ')}`);
    this.name = 'ValidationError';
    this.violations = violations;
    this.babyIds = babyIds;
  }
}

/** Phones' clocks drift; allow a little slack before calling a time "in the future". */
export const FUTURE_TOLERANCE_MS = 5 * MINUTE;
export const MAX_BOTTLE_ML = 1000;
/** Longest finished entry, measured as endAt − startAt (pauses included). Running entries are never checked. */
export const MAX_DURATION_MS = { sleep: 24 * HOUR, breastfeed: 4 * HOUR } as const;
export const MAX_PUMP_ML = 500;
/** Inclusive ranges in whole grams and millimetres. */
export const GROWTH_RANGES = {
  weightG: [300, 30_000],
  heightMm: [200, 1300],
  headMm: [200, 700],
} as const;
export const TEMPERATURE_RANGE_C = [30, 45] as const;
export const TEXT_LIMITS = { medicationName: 60, dose: 40, note: 500 } as const;
export const BABY_NAME_MAX = 40;
export const MIX_NAME_MAX = 40;

const GROWTH_METRICS = ['weightG', 'heightMm', 'headMm'] as const;

export function isTimedType(type: EventType): type is 'sleep' | 'breastfeed' {
  return type === 'sleep' || type === 'breastfeed';
}

export function isOpen(event: { type: EventType; endAt?: number }): boolean {
  return isTimedType(event.type) && event.endAt === undefined;
}

function isIntIn(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function segmentsValid(
  segments: readonly BreastSegment[],
  startAt: number,
  endAt: number | undefined,
): boolean {
  if (segments.length === 0) return false;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const isLast = i === segments.length - 1;
    if (segment.start < startAt) return false;
    if (segment.end !== undefined && segment.end < segment.start) return false;
    if (!isLast && segment.end === undefined) return false;
    const previous = segments[i - 1];
    if (previous && segment.start < previous.end!) return false;
    if (endAt !== undefined && (segment.end === undefined || segment.end > endAt)) return false;
  }
  return true;
}

export function validateEvent(
  draft: EventDraft,
  others: readonly TrackerEvent[],
  now: number,
  selfId?: Id,
): RuleViolation[] {
  const violations = new Set<RuleViolation>();
  const latestAllowed = now + FUTURE_TOLERANCE_MS;

  if (draft.babyId === null && draft.type !== 'pump') violations.add('baby-required');
  if (draft.startAt > latestAllowed) violations.add('in-future');
  if (draft.endAt !== undefined) {
    if (draft.endAt < draft.startAt) violations.add('end-before-start');
    if (draft.endAt > latestAllowed) violations.add('in-future');
    if (isTimedType(draft.type) && draft.endAt - draft.startAt > MAX_DURATION_MS[draft.type])
      violations.add('too-long');
  }
  if (draft.note !== undefined && draft.note.length > TEXT_LIMITS.note)
    violations.add('text-too-long');

  // One running timer per baby: a sleep and a breastfeed never run at once for the same child (Plan 8 §6.3).
  if (isOpen(draft)) {
    const clash = others.some(
      (other) =>
        other.id !== selfId &&
        other.deletedAt === undefined &&
        other.babyId === draft.babyId &&
        isOpen(other),
    );
    if (clash) violations.add('already-running');
  }

  switch (draft.type) {
    case 'breastfeed':
      if (!segmentsValid(draft.segments, draft.startAt, draft.endAt))
        violations.add('segments-invalid');
      break;
    case 'bottle':
      if (!(draft.ml > 0 && draft.ml <= MAX_BOTTLE_ML)) violations.add('amount-invalid');
      break;
    case 'diaper':
      if (!draft.wet && !draft.dirty) violations.add('diaper-empty');
      break;
    case 'pump': {
      const amounts = [draft.mlLeft, draft.mlRight].filter((ml): ml is number => ml !== undefined);
      if (amounts.length === 0) violations.add('pump-empty');
      else if (!amounts.every((ml) => isIntIn(ml, 1, MAX_PUMP_ML))) violations.add('pump-invalid');
      break;
    }
    case 'growth': {
      const growth = draft;
      const present = GROWTH_METRICS.filter((metric) => growth[metric] !== undefined);
      if (present.length === 0) violations.add('growth-empty');
      for (const metric of present) {
        const value = growth[metric]!;
        const [min, max] = GROWTH_RANGES[metric];
        // A kg field above 30 almost always means grams were typed; say so instead of "invalid".
        if (metric === 'weightG' && value > max) violations.add('weight-in-kg');
        else if (!isIntIn(value, min, max)) violations.add('growth-invalid');
      }
      break;
    }
    case 'temperature': {
      const [min, max] = TEMPERATURE_RANGE_C;
      if (!(Number.isFinite(draft.celsius) && draft.celsius >= min && draft.celsius <= max))
        violations.add('temperature-invalid');
      break;
    }
    case 'medication': {
      const name = draft.name ?? '';
      if (name.trim() === '') violations.add('medication-name-required');
      if (name.length > TEXT_LIMITS.medicationName || (draft.dose ?? '').length > TEXT_LIMITS.dose)
        violations.add('text-too-long');
      break;
    }
    case 'healthNote':
      if ((draft.note ?? '').trim() === '') violations.add('note-required');
      break;
    default:
      break;
  }
  return [...violations];
}

export function validateBabyName(name: string): RuleViolation[] {
  return name.trim() === '' ? ['name-required'] : [];
}

/** A saved mix's name: trimmed, 1–40 characters. Duplicates are allowed (two phones' same-named mix both survive a merge). */
export function validateMixName(name: string): RuleViolation[] {
  const trimmed = name.trim();
  if (trimmed === '') return ['name-required'];
  return trimmed.length > MIX_NAME_MAX ? ['text-too-long'] : [];
}

/** Minutes typed for the sides of a breastfeed in the edit sheet: at least one side, each a whole number ≥ 1. */
export function editedMinutesValid(minutes: readonly number[]): boolean {
  return minutes.length > 0 && minutes.every((m) => Number.isInteger(m) && m >= 1);
}
