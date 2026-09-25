import { MINUTE } from './time';
import type { BreastSegment, EventDraft, EventType, Id, TrackerEvent } from './types';

export type RuleViolation =
  | 'baby-required'
  | 'in-future'
  | 'end-before-start'
  | 'already-running'
  | 'segments-invalid'
  | 'amount-invalid'
  | 'diaper-empty'
  | 'name-required';

export class ValidationError extends Error {
  readonly violations: readonly RuleViolation[];

  constructor(violations: readonly RuleViolation[]) {
    super(`Validation failed: ${violations.join(', ')}`);
    this.name = 'ValidationError';
    this.violations = violations;
  }
}

/** Phones' clocks drift; allow a little slack before calling a time "in the future". */
export const FUTURE_TOLERANCE_MS = 5 * MINUTE;
export const MAX_BOTTLE_ML = 1000;

export function isTimedType(type: EventType): type is 'sleep' | 'breastfeed' {
  return type === 'sleep' || type === 'breastfeed';
}

export function isOpen(event: { type: EventType; endAt?: number }): boolean {
  return isTimedType(event.type) && event.endAt === undefined;
}

function segmentsValid(segments: readonly BreastSegment[], startAt: number, endAt: number | undefined): boolean {
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
  }

  if (isOpen(draft)) {
    const clash = others.some(
      (other) =>
        other.id !== selfId &&
        other.deletedAt === undefined &&
        other.babyId === draft.babyId &&
        other.type === draft.type &&
        isOpen(other),
    );
    if (clash) violations.add('already-running');
  }

  switch (draft.type) {
    case 'breastfeed':
      if (!segmentsValid(draft.segments, draft.startAt, draft.endAt)) violations.add('segments-invalid');
      break;
    case 'bottle':
      if (!(draft.ml > 0 && draft.ml <= MAX_BOTTLE_ML)) violations.add('amount-invalid');
      break;
    case 'diaper':
      if (!draft.wet && !draft.dirty) violations.add('diaper-empty');
      break;
    default:
      break;
  }
  return [...violations];
}

export function validateBabyName(name: string): RuleViolation[] {
  return name.trim() === '' ? ['name-required'] : [];
}
