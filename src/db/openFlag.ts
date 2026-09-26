import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';
import { isOpen } from '../domain/rules';
import type { EventType } from '../domain/types';

/** The fields that decide whether a stored event row carries the storage-only `open: 1` marker. */
export interface FlaggableRow {
  type: EventType;
  endAt?: number;
  deletedAt?: number;
  open?: 1;
}

/** True for a running timer that has not been deleted: exactly the rows in the sparse `open` index. */
export function shouldBeOpen(row: FlaggableRow): boolean {
  return isOpen(row) && row.deletedAt === undefined;
}

/** A copy of `row` with `open: 1` when it is running and not deleted, and without the field otherwise. */
export function withOpenFlag<T extends FlaggableRow>(row: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the property
  const { open: _previous, ...rest } = row;
  return (shouldBeOpen(row) ? { ...rest, open: 1 as const } : rest) as unknown as T;
}

function flagWrites(req: DBCoreMutateRequest): DBCoreMutateRequest {
  if (req.type !== 'add' && req.type !== 'put') return req;
  return { ...req, values: req.values.map((value: FlaggableRow) => withOpenFlag(value)) };
}

/**
 * Keeps the `open` index of the events table right for every writer. Table.add reaches DBCore as `add`;
 * Table.put, bulkPut, Table.update and Collection.modify reach it as `put` carrying the full new values.
 * So the flag cannot be forgotten, including by a later import that writes through Dexie.
 */
export const openFlagMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'open-flag',
  create: (down) => ({
    ...down,
    table: (name: string): DBCoreTable => {
      const table = down.table(name);
      if (name !== 'events') return table;
      return { ...table, mutate: (req) => table.mutate(flagWrites(req)) };
    },
  }),
};
