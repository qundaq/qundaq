import type { EventType, Id } from './types';

/**
 * Hides the entries of deleted and archived babies. Deleting a baby does not tombstone its entries (the
 * backup keeps full fidelity), so every reader passes its lists through here. Pumps (no baby) stay.
 */
export function visibleEvents<T extends { babyId: Id | null }>(
  events: readonly T[],
  liveBabyIds: ReadonlySet<Id>,
): T[] {
  return events.filter((event) => event.babyId === null || liveBabyIds.has(event.babyId));
}

export type TypeFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'pump' | 'other';
export const TYPE_FILTERS: readonly TypeFilter[] = [
  'all',
  'feeding',
  'sleep',
  'diaper',
  'pump',
  'other',
];

const TYPES: Record<Exclude<TypeFilter, 'all'>, readonly EventType[]> = {
  feeding: ['breastfeed', 'bottle'],
  sleep: ['sleep'],
  diaper: ['diaper'],
  pump: ['pump'],
  other: ['growth', 'temperature', 'medication', 'healthNote'],
};

/** `babyId` null means every baby, pumps included; a baby id leaves pumps out (they belong to no baby). */
export function matchesFilters(
  event: { babyId: Id | null; type: EventType },
  babyId: Id | null,
  type: TypeFilter,
): boolean {
  if (babyId !== null && event.babyId !== babyId) return false;
  return type === 'all' || TYPES[type].includes(event.type);
}

/** The chosen baby if still live, else the first baby. */
export function pickBaby(babies: readonly { id: Id }[], chosen: Id | null): Id | null {
  if (chosen !== null && babies.some((baby) => baby.id === chosen)) return chosen;
  return babies[0]?.id ?? null;
}
