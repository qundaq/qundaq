import type { Id } from '../domain/types';
import { BABY_KEYS, EVENT_KEYS } from './format';

/**
 * What happens to one row of the file. add: new to the device. update: the file's copy wins. same: both
 * copies are equal. keep: the device's copy wins.
 */
export type Outcome = 'add' | 'update' | 'same' | 'keep';

export type Row = { id: Id; updatedAt: number; deletedAt?: number };

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

/**
 * Every field a baby or an event row can legitimately have (the storage-only `open` marker is not
 * one of them, so it drops out on its own). A device row may also carry an unknown field; canonicalRow
 * ignores those too, on both sides, so two rows that
 * agree on every field the current app understands compare equal regardless of what else either one is
 * carrying.
 */
const CANONICAL_KEYS = new Set<string>([...BABY_KEYS, ...EVENT_KEYS]);

/** A row as JSON with sorted keys and only the known fields: equal rows give equal strings, whatever their key order. */
export function canonicalRow(row: object): string {
  const source = row as Record<string, unknown>;
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(source)) if (CANONICAL_KEYS.has(key)) rest[key] = source[key];
  return JSON.stringify(sortKeys(rest));
}

/**
 * Last writer wins, by `updatedAt`. Equal times with different content: the copy whose canonical JSON
 * sorts larger wins, so two phones merging each other's backups end up with the same row. (A phone whose
 * clock runs ahead wins more often; there is no better clock to go by.)
 */
export function compareRows(local: Row | undefined, incoming: Row): Outcome {
  if (local === undefined) return 'add';
  if (incoming.updatedAt > local.updatedAt) return 'update';
  if (incoming.updatedAt < local.updatedAt) return 'keep';
  const mine = canonicalRow(local);
  const theirs = canonicalRow(incoming);
  if (mine === theirs) return 'same';
  return theirs > mine ? 'update' : 'keep';
}

export const isLive = (row: { deletedAt?: number }) => row.deletedAt === undefined;
