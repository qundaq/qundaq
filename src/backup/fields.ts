import type { Id } from '../domain/types';
import type { ProblemCode } from './validate';

export const MAX_ID_LENGTH = 64;

export class RowProblem extends Error {
  constructor(readonly code: ProblemCode) {
    super(code);
  }
}

export function fail(code: ProblemCode): never {
  throw new RowProblem(code);
}

export type Row = Record<string, unknown>;

export function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the row's own fields: never anything inherited, such as a `__proto__` or `constructor`. */
export function own(row: Row, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A time within years 0–9999, well inside the ECMAScript time value range (±8.64e15). The full range is
 * too generous: a value near its edge still formats today but throws once a day is added to it (the
 * out-of-range check) or it is shown with Intl, so it would slip through as "fine" and break later. The
 * app itself only ever writes years within this range.
 */
export const MAX_TIME = 253402300799999; // 9999-12-31T23:59:59.999Z
export const MIN_TIME = -62167219200000; // 0000-01-01T00:00:00.000Z

export function isTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= MIN_TIME && value <= MAX_TIME;
}

export function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function isId(value: unknown): value is Id {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

export function readId(row: Row): Id {
  const id = own(row, 'id');
  return isId(id) ? id : fail('bad-id');
}

/** createdAt, updatedAt and an optional deletedAt. */
export function readBookkeeping(row: Row): {
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
} {
  const createdAt = own(row, 'createdAt');
  const updatedAt = own(row, 'updatedAt');
  const deletedAt = own(row, 'deletedAt');
  if (!isTime(createdAt) || !isTime(updatedAt)) fail('bad-time');
  if (deletedAt !== undefined && !isTime(deletedAt)) fail('bad-time');
  return { createdAt, updatedAt, ...(deletedAt === undefined ? {} : { deletedAt }) };
}
