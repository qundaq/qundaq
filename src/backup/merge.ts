import { foldCase } from '../domain/text';
import type { Baby, Id, TrackerEvent } from '../domain/types';
import { BABY_KEYS, EVENT_KEYS, type BackupSettings } from './format';
import { findStale, repairRunning, type StaleTimer, type StoppedTimer } from './running';
import type { ParsedBackup } from './validate';

export type ImportMode = 'merge' | 'replace';

/** The device's side of an import. Event rows come without the storage-only `open` marker. */
export interface LocalState {
  babies: readonly Baby[];
  events: readonly TrackerEvent[];
  settings: BackupSettings;
}

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

export interface ImportOptions {
  mode: ImportMode;
  /**
   * Pairs the user confirmed as the same child (merge only): the surviving baby of each pair (the earlier
   * createdAt, ties to the smaller id; the device's or the backup's) absorbs the other's entries, and the
   * other is deleted.
   */
  sameBabies: readonly SameBabyPair[];
  /** Stop the file's stale running timers at the time of the backup ("Yedeğin alındığı anda durdur"). */
  stopStale: boolean;
}

/**
 * What happens to one row of the file. add: new to the device. update: the file's copy wins. same: both
 * copies are equal. keep: the device's copy wins.
 */
export type Outcome = 'add' | 'update' | 'same' | 'keep';

/**
 * Counts of the file's rows by outcome. `remove`: the file's newer deletion of a row that is live on the
 * device (an update that makes it disappear). `deleted`: tombstones that change nothing the user sees.
 * Merge with "Aynı bebek": a file baby that the pairing deletes (the device's baby survives) counts as
 * `same`, not `add`; a file entry that the pairing moves is counted in `ImportPlan.moves` only, so every
 * file row is counted exactly once.
 */
export interface TableStats {
  add: number;
  update: number;
  remove: number;
  same: number;
  keep: number;
  deleted: number;
}

export interface ImportStats {
  babies: TableStats;
  events: TableStats;
  /** Live rows on the device now; replace mode removes them. */
  localBabies: number;
  localEvents: number;
}

/** Replace mode: live device entries that the file lacks or that changed after the backup was taken. */
export interface Loss {
  events: number;
  newestAt: number | null; // the latest start among them
}

export interface ImportPlan {
  mode: ImportMode;
  /** Rows to write. In replace mode the tables are cleared first and these are every row of the file. */
  babies: Baby[];
  events: TrackerEvent[];
  settings: BackupSettings;
  stats: ImportStats;
  loss: Loss;
  /** Merge: names of the device's live babies that the file deletes. */
  removedBabies: string[];
  /**
   * Merge: "Aynı bebek" moves, per surviving baby (the device's or the backup's, whichever the pair keeps),
   * its name and how many live entries move onto it from the baby that is deleted, from either side.
   */
  moves: { name: string; events: number }[];
  /** Running timers from the file that were probably forgotten (see findStale), whatever `stopStale` says. */
  stale: StaleTimer[];
  /** Timers the import stops: the chosen stale ones, collisions and the timers of deleted babies. */
  stopped: StoppedTimer[];
}

type Row = { id: Id; updatedAt: number; deletedAt?: number };

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
 * Every field a baby or an event row can legitimately have (the storage-only `open` marker is not one of
 * them, so it drops out on its own). A device row may also carry a legacy or otherwise unknown field from
 * an older version of the app; canonicalRow ignores those too, on both sides, so two rows that agree on
 * every field the current app understands compare equal regardless of what else either one is carrying.
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

const isLive = (row: { deletedAt?: number }) => row.deletedAt === undefined;

function emptyStats(): TableStats {
  return { add: 0, update: 0, remove: 0, same: 0, keep: 0, deleted: 0 };
}

/**
 * Merges one table: every row keyed by id with its winning copy, the rows to write, the ids whose winning
 * copy came from the file, the counts, and which count each file row went to (so a pairing can move it).
 */
function mergeTable<T extends Row>(
  local: readonly T[],
  incoming: readonly T[],
): { result: Map<Id, T>; writes: Map<Id, T>; fromFile: Set<Id>; stats: TableStats; counted: Map<Id, keyof TableStats> } {
  const result = new Map(local.map((row) => [row.id, row]));
  const writes = new Map<Id, T>();
  const fromFile = new Set<Id>();
  const stats = emptyStats();
  const counted = new Map<Id, keyof TableStats>();
  for (const row of incoming) {
    const mine = result.get(row.id);
    const outcome = compareRows(mine, row);
    if (outcome === 'add' || outcome === 'update') {
      result.set(row.id, row);
      writes.set(row.id, row);
      fromFile.add(row.id);
    }
    const wasVisible = mine !== undefined && isLive(mine);
    let bucket: keyof TableStats = outcome;
    // A tombstone for a row the device lacks or has deleted too changes nothing the user sees.
    if (!isLive(row) && !wasVisible) bucket = 'deleted';
    else if (outcome === 'update' && !isLive(row)) bucket = 'remove';
    // The file's live row wins over a row that was not visible on the device (missing, or deleted there):
    // the user sees a new entry appear, whether it is brand new or a revival of one they had deleted.
    else if (outcome === 'update' && isLive(row) && !wasVisible) bucket = 'add';
    stats[bucket] += 1;
    counted.set(row.id, bucket);
  }
  return { result, writes, fromFile, stats, counted };
}

/** Moves a file row's count from where mergeTable put it to `to` (or out of the counts), once. */
function recount(table: { stats: TableStats; counted: Map<Id, keyof TableStats> }, id: Id, to?: keyof TableStats): void {
  const bucket = table.counted.get(id);
  if (bucket === undefined) return;
  table.stats[bucket] -= 1;
  table.counted.delete(id);
  if (to !== undefined) table.stats[to] += 1;
}

function groupByFoldedName(babies: readonly Baby[]): Map<string, Baby[]> {
  const groups = new Map<string, Baby[]>();
  for (const baby of babies) {
    const key = foldCase(baby.name.trim());
    const group = groups.get(key);
    if (group) group.push(baby);
    else groups.set(key, [baby]);
  }
  return groups;
}

/**
 * A live device baby and a live backup baby with the same name (ignoring case, İ/ı included) but different
 * ids: the same child, added again after a wipe. Pairs only when exactly one live baby on each side shares
 * that name — an ambiguous name (two babies on one side, or on both) is never guessed at, so it is left
 * unpaired. Babies whose id is on both sides are the same record already, not a same-name candidate.
 */
export function findSameBabies(local: readonly Baby[], incoming: readonly Baby[]): SameBabyPair[] {
  const localIds = new Set(local.map((baby) => baby.id));
  const incomingIds = new Set(incoming.map((baby) => baby.id));
  const localGroups = groupByFoldedName(local.filter((baby) => isLive(baby) && !incomingIds.has(baby.id)));
  const incomingGroups = groupByFoldedName(incoming.filter((baby) => isLive(baby) && !localIds.has(baby.id)));

  const pairs: SameBabyPair[] = [];
  for (const [key, locals] of localGroups) {
    if (locals.length !== 1) continue;
    const matches = incomingGroups.get(key);
    if (!matches || matches.length !== 1) continue;
    const mine = locals[0]!;
    const theirs = matches[0]!;
    pairs.push({ localId: mine.id, incomingId: theirs.id, name: theirs.name, localName: mine.name });
  }
  return pairs;
}

/** Remapped through `rename`, kept only for babies that are live afterwards, without duplicates. */
function liveIds(ids: readonly Id[], babies: ReadonlyMap<Id, Baby>, rename: ReadonlyMap<Id, Id> = new Map()): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const next = rename.get(id) ?? id;
    const baby = babies.get(next);
    if (baby && isLive(baby) && !out.includes(next)) out.push(next);
  }
  return out;
}

/** The stale timers and the repaired rows, for either mode. `device`: the device's rows as the merge sees them. */
function repair(
  merged: Map<Id, TrackerEvent>,
  fromFile: ReadonlySet<Id>,
  device: readonly TrackerEvent[],
  babies: ReadonlyMap<Id, Baby>,
  backup: ParsedBackup,
  options: ImportOptions,
  now: number,
): { stale: StaleTimer[]; changed: TrackerEvent[]; stopped: StoppedTimer[] } {
  const stale = findStale(merged.values(), fromFile, device, backup.exportedAt, now);
  const stopStale = new Set(options.stopStale ? stale.map((timer) => timer.id) : []);
  return { stale, ...repairRunning(merged.values(), babies, { exportedAt: backup.exportedAt, now, stopStale }) };
}

function replacePlan(local: LocalState, backup: ParsedBackup, options: ImportOptions, now: number): ImportPlan {
  const babies = new Map(backup.babies.map((baby) => [baby.id, baby]));
  const events = new Map(backup.events.map((event) => [event.id, event]));
  const { stale, changed, stopped } = repair(events, new Set(events.keys()), local.events, babies, backup, options, now);
  for (const event of changed) events.set(event.id, event);
  const fileIds = new Set(backup.events.map((event) => event.id));
  const lost = local.events.filter((event) => isLive(event) && (!fileIds.has(event.id) || event.updatedAt > backup.exportedAt));
  // A loop, not Math.max(...): a spread of 100,000 entries exceeds JavaScriptCore's argument limit.
  let newestAt: number | null = null;
  for (const event of lost) if (newestAt === null || event.startAt > newestAt) newestAt = event.startAt;
  const count = (rows: readonly Row[]): TableStats => ({ ...emptyStats(), add: rows.filter(isLive).length, deleted: rows.filter((row) => !isLive(row)).length });
  return {
    mode: 'replace',
    babies: [...backup.babies],
    events: [...events.values()],
    settings: {
      locale: backup.settings.locale ?? local.settings.locale,
      nightMode: backup.settings.nightMode ?? local.settings.nightMode,
      lastBabyIds: liveIds(backup.settings.lastBabyIds, babies),
    },
    stats: {
      babies: count(backup.babies),
      events: count(backup.events),
      localBabies: local.babies.filter(isLive).length,
      localEvents: local.events.filter(isLive).length,
    },
    loss: { events: lost.length, newestAt },
    removedBabies: [],
    moves: [],
    stale,
    stopped,
  };
}

function mergePlan(local: LocalState, backup: ParsedBackup, options: ImportOptions, now: number): ImportPlan {
  const babies = mergeTable(local.babies, backup.babies);
  const events = mergeTable(local.events, backup.events);
  const removedBabies = local.babies
    .filter((baby) => isLive(baby) && babies.writes.has(baby.id) && !isLive(babies.writes.get(baby.id)!))
    .map((baby) => baby.name);

  // "Aynı bebek": one of the pair survives and the other is deleted, with its entries moved to the
  // survivor. Both phones must agree on the survivor without negotiating, so it is picked by a rule that
  // only looks at the two baby records themselves (both phones can see both): the earlier createdAt, ties
  // broken by the smaller id. Whichever phone's baby loses keeps working exactly like before; whichever
  // phone's baby wins now also absorbs the other side's history.
  const rename = new Map<Id, Id>();
  for (const pair of options.sameBabies) {
    const mine = babies.result.get(pair.localId);
    const theirs = babies.result.get(pair.incomingId);
    if (!mine || !isLive(mine) || !theirs || !isLive(theirs) || pair.localId === pair.incomingId) continue;
    const mineSurvives = mine.createdAt !== theirs.createdAt ? mine.createdAt < theirs.createdAt : mine.id < theirs.id;
    const [keep, drop] = mineSurvives ? [mine, theirs] : [theirs, mine];
    rename.set(drop.id, keep.id);
    const tombstone = { ...drop, deletedAt: now, updatedAt: now };
    babies.result.set(drop.id, tombstone);
    babies.writes.set(drop.id, tombstone);
    // The file's baby is the device's own baby, not a new one: counted as the same, not as an add.
    if (drop === theirs) recount(babies, drop.id, 'same');
  }
  const moved = new Map<Id, number>();
  if (rename.size > 0) {
    // Every entry of the dropped baby is remapped, live or deleted, so none is left pointing at a
    // tombstoned baby; only the live ones are counted, since those are what the user sees move.
    for (const event of events.result.values()) {
      const target = event.babyId === null ? undefined : rename.get(event.babyId);
      if (target === undefined) continue;
      const next = { ...event, babyId: target, updatedAt: now };
      events.result.set(event.id, next);
      events.writes.set(event.id, next);
      if (!isLive(event)) continue;
      moved.set(target, (moved.get(target) ?? 0) + 1);
      // A file entry that moves is counted in moves only, not in the file's counts too.
      recount(events, event.id);
    }
  }

  // The device's entries as they will be, renamed babies included, to judge the file's running timers by.
  const device = local.events.map((event) => {
    const target = event.babyId === null ? undefined : rename.get(event.babyId);
    return target === undefined ? event : { ...event, babyId: target };
  });
  const { stale, changed, stopped } = repair(events.result, events.fromFile, device, babies.result, backup, options, now);
  for (const event of changed) {
    events.result.set(event.id, event);
    events.writes.set(event.id, event);
  }

  return {
    mode: 'merge',
    babies: [...babies.writes.values()],
    events: [...events.writes.values()],
    settings: {
      locale: local.settings.locale,
      nightMode: local.settings.nightMode,
      lastBabyIds: liveIds(local.settings.lastBabyIds, babies.result, rename),
    },
    stats: {
      babies: babies.stats,
      events: events.stats,
      localBabies: local.babies.filter(isLive).length,
      localEvents: local.events.filter(isLive).length,
    },
    loss: { events: 0, newestAt: null },
    removedBabies,
    moves: [...moved].map(([id, count]) => ({ name: babies.result.get(id)!.name, events: count })),
    stale,
    stopped,
  };
}

/**
 * What an import will write, computed without writing anything, so the preview can show it and
 * applyImport can check it again inside its transaction. Pure.
 */
export function planImport(local: LocalState, backup: ParsedBackup, options: ImportOptions, now: number): ImportPlan {
  return options.mode === 'replace' ? replacePlan(local, backup, options, now) : mergePlan(local, backup, options, now);
}

/** A summary of what the plan would change; applyImport refuses to write when it differs from the preview's. */
export function planSignature(plan: ImportPlan): string {
  return JSON.stringify([plan.mode, plan.stats, plan.loss, plan.removedBabies, plan.moves, plan.stale, plan.stopped]);
}
