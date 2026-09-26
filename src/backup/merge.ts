import type { Baby, Id, Mix, TrackerEvent } from '../domain/types';
import type { BackupSettings } from './format';
import { compareRows, isLive, type Row } from './rows';
import { findStale, repairRunning, type StaleTimer, type StoppedTimer } from './running';
import { displayName, foldedName, groupByFoldedName, type SameBabyPair } from './sameBaby';
import type { ParsedBackup } from './validate';

export type ImportMode = 'merge' | 'replace';

/** The device's side of an import. Event rows come without the storage-only `open` marker. */
export interface LocalState {
  babies: readonly Baby[];
  events: readonly TrackerEvent[];
  mixes: readonly Mix[];
  settings: BackupSettings;
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
  /**
   * Merge: device babies of `ImportPlan.follows` whose entries the user chose to leave with them (hidden,
   * as the baby is deleted) instead of moving them to the other baby of that name. Absent: all of them move.
   */
  keepApart?: readonly Id[];
}

/**
 * Merge: a live device baby that the file deletes (the other phone paired it with another baby of the same
 * name and deleted it there), or a baby deleted here that the file's live entries still point at (this
 * phone paired it earlier), while exactly one other live baby of that name is left afterwards. Unless the
 * user keeps it apart, those live entries move onto that baby instead of being hidden with it.
 */
export interface FollowingBaby {
  localId: Id;
  name: string; // the deleted baby, as this device spells it
  survivorName: string; // the baby its entries move to
}

/**
 * Counts of the file's rows by outcome. `remove`: the file's newer deletion of a row that is live on the
 * device (an update that makes it disappear). `deleted`: tombstones that change nothing the user sees.
 * Merge with "Aynı bebek": the file's baby of a pair counts as `same`, not `add`, whether the pairing
 * deletes it or keeps it (the device ends with as many babies either way); a file entry that the pairing
 * moves is counted in `ImportPlan.moves` only, so every file row is counted exactly once.
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
  mixes: TableStats;
  /** Live rows on the device now; replace mode removes them. */
  localBabies: number;
  localEvents: number;
  localMixes: number;
}

/** Replace mode: live device rows that the file lacks or that changed after the backup was taken. */
export interface Loss {
  events: number;
  newestAt: number | null; // the latest start among the lost events
  mixes: number;
}

export interface ImportPlan {
  mode: ImportMode;
  /**
   * Rows to write. Merge: the file's rows that win, plus every row the pairing, a followed baby or the
   * timer repair changes (the device's own rows included). Replace: the tables are cleared first, and
   * these are every row of the file, with its repaired timers stopped.
   */
  babies: Baby[];
  events: TrackerEvent[];
  /** Saved mixes merge like babies (last writer wins, tombstones), with no pairing. */
  mixes: Mix[];
  settings: BackupSettings;
  stats: ImportStats;
  loss: Loss;
  /** Merge: names of the device's live babies that the file deletes. */
  removedBabies: string[];
  /**
   * Merge: "Aynı bebek" moves, per surviving baby (the device's or the backup's, whichever the pair keeps,
   * or the one a deleted baby's entries follow to), its name and how many live entries move onto it.
   */
  moves: { name: string; events: number }[];
  /**
   * Merge: deleted babies whose live entries can follow to the other baby of that name (moved or kept
   * apart): a device baby the file deletes, or a baby deleted here that the file's new entries point at.
   */
  follows: FollowingBaby[];
  /** Merge: deleted babies, with how many live entries become hidden with them (none moved), for the same two cases. */
  hidden: { name: string; events: number }[];
  /** Running timers from the file that were probably forgotten (see findStale), whatever `stopStale` says. */
  stale: StaleTimer[];
  /** Timers the import stops: the chosen stale ones, collisions and the timers of deleted babies. */
  stopped: StoppedTimer[];
}

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
): {
  result: Map<Id, T>;
  writes: Map<Id, T>;
  fromFile: Set<Id>;
  stats: TableStats;
  counted: Map<Id, keyof TableStats>;
} {
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
function recount(
  table: { stats: TableStats; counted: Map<Id, keyof TableStats> },
  id: Id,
  to?: keyof TableStats,
): void {
  const bucket = table.counted.get(id);
  if (bucket === undefined) return;
  table.stats[bucket] -= 1;
  table.counted.delete(id);
  if (to !== undefined) table.stats[to] += 1;
}

/** Remapped through `rename`, kept only for babies that are live afterwards, without duplicates. */
function liveIds(
  ids: readonly Id[],
  babies: ReadonlyMap<Id, Baby>,
  rename: ReadonlyMap<Id, Id> = new Map(),
): Id[] {
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
  return {
    stale,
    ...repairRunning(merged.values(), babies, { exportedAt: backup.exportedAt, now, stopStale }),
  };
}

function replacePlan(
  local: LocalState,
  backup: ParsedBackup,
  options: ImportOptions,
  now: number,
): ImportPlan {
  const babies = new Map(backup.babies.map((baby) => [baby.id, baby]));
  const events = new Map(backup.events.map((event) => [event.id, event]));
  const { stale, changed, stopped } = repair(
    events,
    new Set(events.keys()),
    local.events,
    babies,
    backup,
    options,
    now,
  );
  for (const event of changed) events.set(event.id, event);

  const fileIds = new Set(backup.events.map((event) => event.id));
  const lost = local.events.filter(
    (event) => isLive(event) && (!fileIds.has(event.id) || event.updatedAt > backup.exportedAt),
  );
  // A loop, not Math.max(...): a spread of 100,000 entries exceeds JavaScriptCore's argument limit.
  let newestAt: number | null = null;
  for (const event of lost)
    if (newestAt === null || event.startAt > newestAt) newestAt = event.startAt;
  const mixFileIds = new Set(backup.mixes.map((mix) => mix.id));
  const lostMixes = local.mixes.filter(
    (mix) => isLive(mix) && (!mixFileIds.has(mix.id) || mix.updatedAt > backup.exportedAt),
  ).length;

  const count = (rows: readonly Row[]): TableStats => ({
    ...emptyStats(),
    add: rows.filter(isLive).length,
    deleted: rows.filter((row) => !isLive(row)).length,
  });
  return {
    mode: 'replace',
    babies: [...backup.babies],
    events: [...events.values()],
    mixes: [...backup.mixes],
    settings: {
      locale: backup.settings.locale ?? local.settings.locale,
      nightMode: backup.settings.nightMode ?? local.settings.nightMode,
      lastBabyIds: liveIds(backup.settings.lastBabyIds, babies),
    },
    stats: {
      babies: count(backup.babies),
      events: count(backup.events),
      mixes: count(backup.mixes),
      localBabies: local.babies.filter(isLive).length,
      localEvents: local.events.filter(isLive).length,
      localMixes: local.mixes.filter(isLive).length,
    },
    loss: { events: lost.length, newestAt, mixes: lostMixes },
    removedBabies: [],
    moves: [],
    follows: [],
    hidden: [],
    stale,
    stopped,
  };
}

function mergePlan(
  local: LocalState,
  backup: ParsedBackup,
  options: ImportOptions,
  now: number,
): ImportPlan {
  const babies = mergeTable(local.babies, backup.babies);
  const events = mergeTable(local.events, backup.events);
  const mixes = mergeTable(local.mixes, backup.mixes);
  // The device's live babies that the file deletes.
  const removed = local.babies.filter(
    (baby) => isLive(baby) && babies.writes.has(baby.id) && !isLive(babies.writes.get(baby.id)!),
  );

  // "Aynı bebek": one of the pair survives and the other is deleted, with its entries moved to the
  // survivor. Both phones must agree on the survivor without negotiating, so it is picked by a rule that
  // only looks at the two baby records themselves (both phones can see both): the earlier createdAt, ties
  // broken by the smaller id. Whichever phone's baby loses keeps working exactly like before; whichever
  // phone's baby wins now also absorbs the other side's history.
  const rename = new Map<Id, Id>();
  for (const pair of options.sameBabies) {
    const mine = babies.result.get(pair.localId);
    const theirs = babies.result.get(pair.incomingId);
    if (!mine || !isLive(mine) || !theirs || !isLive(theirs) || pair.localId === pair.incomingId)
      continue;
    const mineSurvives =
      mine.createdAt !== theirs.createdAt ? mine.createdAt < theirs.createdAt : mine.id < theirs.id;
    const [keep, drop] = mineSurvives ? [mine, theirs] : [theirs, mine];
    rename.set(drop.id, keep.id);
    const tombstone = { ...drop, deletedAt: now, updatedAt: now };
    babies.result.set(drop.id, tombstone);
    babies.writes.set(drop.id, tombstone);
    // Either way the file's baby is the device's own baby, not a new one: counted as the same, not as an
    // add, whether it is the one deleted or the one that survives.
    recount(babies, theirs.id, 'same');
  }
  // A baby the file deletes: on the other phone it was most likely paired with another baby of the same
  // name, which the file carries, while this phone went on logging on it. Those entries would be hidden
  // with the deleted baby (and travel on under it), so when exactly one other live baby of that name is
  // left, they follow to it, unless the user keeps them apart. Otherwise the preview says how many hide.
  const liveEntries = new Map<Id, number>();
  for (const event of events.result.values()) {
    if (isLive(event) && event.babyId !== null)
      liveEntries.set(event.babyId, (liveEntries.get(event.babyId) ?? 0) + 1);
  }
  const liveByName = groupByFoldedName([...babies.result.values()].filter(isLive));
  const keepApart = new Set(options.keepApart ?? []);
  const follows: FollowingBaby[] = [];
  const hidden: { name: string; events: number }[] = [];
  const followed = new Set<Id>();
  for (const gone of removed) {
    const count = liveEntries.get(gone.id) ?? 0;
    if (count === 0) continue;
    const key = foldedName(gone);
    const same = key === null ? undefined : liveByName.get(key);
    if (same?.length === 1) {
      const survivor = same[0]!;
      follows.push({ localId: gone.id, name: displayName(gone), survivorName: survivor.name });
      if (!keepApart.has(gone.id)) {
        rename.set(gone.id, survivor.id);
        followed.add(gone.id);
        continue;
      }
    }
    hidden.push({ name: displayName(gone), events: count });
  }

  const moved = new Map<Id, number>();
  if (rename.size > 0) {
    // Every entry of a pair's dropped baby is remapped, live or deleted, so none is left pointing at a
    // baby the pairing tombstones; only the live ones are counted, since those are what the user sees move.
    // A followed baby's deleted entries stay where they are: the file deleted that baby, not the pairing.
    for (const event of events.result.values()) {
      const target = event.babyId === null ? undefined : rename.get(event.babyId);
      if (target === undefined) continue;
      if (!isLive(event) && followed.has(event.babyId!)) continue;
      const next = { ...event, babyId: target, updatedAt: now };
      events.result.set(event.id, next);
      events.writes.set(event.id, next);
      if (!isLive(event)) continue;
      moved.set(target, (moved.get(target) ?? 0) + 1);
      // A file entry that moves is counted in moves only, not in the file's counts too.
      recount(events, event.id);
    }
  }

  // The file's live entries on a baby that is not live here (typically one this phone's earlier pairing
  // deleted, while the other phone went on logging on it): the same rule. They come in under the one live
  // baby of that name, or are counted as hidden. Only the file's winning rows, never the device's own
  // entries of a baby deleted here, and not the babies handled above.
  const handled = new Set(removed.map((baby) => baby.id));
  const stranded = new Map<Id, TrackerEvent[]>();
  for (const event of events.result.values()) {
    if (
      !events.fromFile.has(event.id) ||
      !isLive(event) ||
      event.babyId === null ||
      handled.has(event.babyId)
    )
      continue;
    const owner = babies.result.get(event.babyId);
    if (owner && isLive(owner)) continue;
    stranded.set(event.babyId, [...(stranded.get(event.babyId) ?? []), event]);
  }
  for (const [babyId, entries] of stranded) {
    const owner = babies.result.get(babyId);
    const key = owner ? foldedName(owner) : null;
    const same = key === null ? undefined : liveByName.get(key);
    const name = owner ? displayName(owner) : '?';
    if (same?.length === 1) {
      const survivor = same[0]!;
      follows.push({ localId: babyId, name, survivorName: survivor.name });
      if (!keepApart.has(babyId)) {
        for (const event of entries) {
          const next = { ...event, babyId: survivor.id, updatedAt: now };
          events.result.set(event.id, next);
          events.writes.set(event.id, next);
          moved.set(survivor.id, (moved.get(survivor.id) ?? 0) + 1);
          recount(events, event.id);
        }
        continue;
      }
    }
    hidden.push({ name, events: entries.length });
  }

  // The device's entries as they will be, renamed babies included, to judge the file's running timers by.
  const device = local.events.map((event) => {
    const target = event.babyId === null ? undefined : rename.get(event.babyId);
    return target === undefined ? event : { ...event, babyId: target };
  });
  const { stale, changed, stopped } = repair(
    events.result,
    events.fromFile,
    device,
    babies.result,
    backup,
    options,
    now,
  );
  for (const event of changed) {
    events.result.set(event.id, event);
    events.writes.set(event.id, event);
  }

  return {
    mode: 'merge',
    babies: [...babies.writes.values()],
    events: [...events.writes.values()],
    mixes: [...mixes.writes.values()],
    settings: {
      locale: local.settings.locale,
      nightMode: local.settings.nightMode,
      lastBabyIds: liveIds(local.settings.lastBabyIds, babies.result, rename),
    },
    stats: {
      babies: babies.stats,
      events: events.stats,
      mixes: mixes.stats,
      localBabies: local.babies.filter(isLive).length,
      localEvents: local.events.filter(isLive).length,
      localMixes: local.mixes.filter(isLive).length,
    },
    loss: { events: 0, newestAt: null, mixes: 0 },
    removedBabies: removed.map(displayName),
    moves: [...moved].map(([id, count]) => ({ name: babies.result.get(id)!.name, events: count })),
    follows,
    hidden,
    stale,
    stopped,
  };
}

/**
 * What an import will write, computed without writing anything, so the preview can show it and
 * applyImport can check it again inside its transaction. Pure.
 */
export function planImport(
  local: LocalState,
  backup: ParsedBackup,
  options: ImportOptions,
  now: number,
): ImportPlan {
  return options.mode === 'replace'
    ? replacePlan(local, backup, options, now)
    : mergePlan(local, backup, options, now);
}

/** A summary of what the plan would change; applyImport refuses to write when it differs from the preview's. */
export function planSignature(plan: ImportPlan): string {
  return JSON.stringify([
    plan.mode,
    plan.stats,
    plan.loss,
    plan.removedBabies,
    plan.moves,
    plan.follows,
    plan.hidden,
    plan.stale,
    plan.stopped,
  ]);
}
