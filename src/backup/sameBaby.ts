import { foldCase } from '../domain/text';
import type { Baby, Id } from '../domain/types';
import { isLive } from './rows';

/**
 * A device baby and a backup baby with the same name but different ids: the same child, added again after
 * a wipe. Confirmed, one of the two survives (see mergePlan: the earlier createdAt, ties to the smaller id),
 * so either side's baby may be the one kept.
 */
export interface SameBabyPair {
  localId: Id;
  incomingId: Id;
  name: string; // as the backup spells it
  localName: string; // as this device spells it
}

/**
 * The name as pairing compares it (case folded, including the Turkish dotted/dotless i, trimmed), or null
 * for a device row whose name is not a string: device rows were never validated, and such a baby is never
 * paired, only left as it is.
 */
export function foldedName(baby: Baby): string | null {
  return typeof baby.name === 'string' ? foldCase(baby.name.trim()) : null;
}

/** The name to show for a device baby, whose row may be malformed. */
export function displayName(baby: Baby): string {
  return typeof baby.name === 'string' ? baby.name : '?';
}

export function groupByFoldedName(babies: readonly Baby[]): Map<string, Baby[]> {
  const groups = new Map<string, Baby[]>();
  for (const baby of babies) {
    const key = foldedName(baby);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(baby);
    else groups.set(key, [baby]);
  }
  return groups;
}

/**
 * A live device baby and a live backup baby with the same name (ignoring case, including the Turkish
 * dotted/dotless i) but different ids: the same child, added again after a wipe. Pairs only when exactly
 * one live baby on each side shares that name — an ambiguous name (two babies on one side, or on both) is
 * never guessed at, so it is left unpaired. Babies whose id is on both sides are the same record already,
 * not a same-name candidate.
 */
export function findSameBabies(local: readonly Baby[], incoming: readonly Baby[]): SameBabyPair[] {
  const localIds = new Set(local.map((baby) => baby.id));
  const incomingIds = new Set(incoming.map((baby) => baby.id));
  const localGroups = groupByFoldedName(
    local.filter((baby) => isLive(baby) && !incomingIds.has(baby.id)),
  );
  const incomingGroups = groupByFoldedName(
    incoming.filter((baby) => isLive(baby) && !localIds.has(baby.id)),
  );

  const pairs: SameBabyPair[] = [];
  for (const [key, locals] of localGroups) {
    if (locals.length !== 1) continue;
    const matches = incomingGroups.get(key);
    if (!matches || matches.length !== 1) continue;
    const mine = locals[0]!;
    const theirs = matches[0]!;
    pairs.push({
      localId: mine.id,
      incomingId: theirs.id,
      name: theirs.name,
      localName: mine.name,
    });
  }
  return pairs;
}
