import { describe, expect, it } from 'vitest';
import {
  canonicalRow,
  compareRows,
  findSameBabies,
  planImport,
  planSignature,
  type ImportOptions,
  type ImportPlan,
  type LocalState,
  type SameBabyPair,
} from '../../src/backup/merge';
import type { ParsedBackup } from '../../src/backup/validate';
import { DAY, HOUR, MINUTE } from '../../src/domain/time';
import type { Baby, EventDraft, Mix, TrackerEvent } from '../../src/domain/types';

const T = 1_790_000_000_000;
const NOW = T + 10 * HOUR;
const MERGE: ImportOptions = { mode: 'merge', sameBabies: [], stopStale: true };
const REPLACE: ImportOptions = { mode: 'replace', sameBabies: [], stopStale: true };

const baby = (id: string, name = id, extra: Partial<Baby> = {}): Baby => ({
  id,
  name,
  color: '#7cb7ff',
  archived: false,
  createdAt: T,
  updatedAt: T,
  ...extra,
});
const event = (
  id: string,
  draft: Partial<EventDraft> = {},
  extra: Partial<TrackerEvent> = {},
): TrackerEvent =>
  ({
    id,
    type: 'diaper',
    babyId: 'a',
    startAt: T,
    wet: true,
    dirty: false,
    createdAt: T,
    updatedAt: T,
    ...draft,
    ...extra,
  }) as TrackerEvent;

const mix = (id: string, name = 'Gece', extra: Partial<Mix> = {}): Mix => ({
  id,
  name,
  layers: [{ soundId: 'white', gain: 0.7 }],
  createdAt: T,
  updatedAt: T,
  ...extra,
});

function local(parts: Partial<LocalState> = {}): LocalState {
  return {
    babies: [baby('a', 'Ada')],
    events: [],
    mixes: [],
    settings: { locale: 'tr', nightMode: false, lastBabyIds: ['a'] },
    ...parts,
  };
}
function backup(parts: Partial<ParsedBackup> = {}): ParsedBackup {
  return {
    schemaVersion: 2,
    exportedAt: T + HOUR,
    appVersion: '0.1.0',
    babies: [baby('a', 'Ada')],
    events: [],
    mixes: [],
    settings: { locale: 'en', nightMode: true, lastBabyIds: ['a'] },
    ...parts,
  };
}

/** What applyImport (Task 8) would do with a plan: overlay its writes onto the device's own rows. */
function applyPlan(state: LocalState, plan: ImportPlan): LocalState {
  const babies = new Map(state.babies.map((row) => [row.id, row]));
  for (const row of plan.babies) babies.set(row.id, row);
  const events = new Map(state.events.map((row) => [row.id, row]));
  for (const row of plan.events) events.set(row.id, row);
  const mixes = new Map(state.mixes.map((row) => [row.id, row]));
  for (const row of plan.mixes) mixes.set(row.id, row);
  return {
    babies: [...babies.values()],
    events: [...events.values()],
    mixes: [...mixes.values()],
    settings: plan.settings,
  };
}

describe('compareRows', () => {
  it('adds what the device lacks, and the larger updatedAt wins', () => {
    expect(compareRows(undefined, event('x'))).toBe('add');
    expect(compareRows(event('x'), event('x', {}, { updatedAt: T + 1 }))).toBe('update');
    expect(compareRows(event('x', {}, { updatedAt: T + 1 }), event('x'))).toBe('keep');
  });

  it('equal times: equal content is the same, whatever the key order and the open marker', () => {
    const mine = {
      id: 'x',
      type: 'sleep',
      babyId: 'a',
      startAt: T,
      createdAt: T,
      updatedAt: T,
      open: 1,
    };
    const theirs = { updatedAt: T, createdAt: T, startAt: T, babyId: 'a', type: 'sleep', id: 'x' };
    expect(canonicalRow(mine)).toBe(canonicalRow(theirs));
    expect(compareRows(mine, theirs)).toBe('same');
  });

  it('equal times, different content: both phones pick the same copy', () => {
    const one = event('x', { note: 'a' } as Partial<EventDraft>);
    const two = event('x', { note: 'b' } as Partial<EventDraft>);
    expect(compareRows(one, two)).toBe('update');
    expect(compareRows(two, one)).toBe('keep');
  });

  it('canonical equality ignores fields outside the known schema, on either side (legacy or unknown keys)', () => {
    const mine = { ...event('x'), legacyField: 'old-data' };
    const theirs = { ...event('x'), someFutureField: true };
    expect(canonicalRow(mine)).toBe(canonicalRow(theirs));
    expect(compareRows(mine, theirs)).toBe('same');
  });
});

describe('planImport: merge', () => {
  it('adds, updates, keeps and counts rows by id, separately for babies and events', () => {
    const plan = planImport(
      local({
        babies: [baby('a', 'Ada')],
        events: [
          event('same'),
          event('older'),
          event('newer', {}, { updatedAt: T + 5 }),
          event('mine-only'),
        ],
      }),
      backup({
        babies: [baby('a', 'Ada'), baby('c', 'Can')],
        events: [
          event('same'),
          event('older', {}, { updatedAt: T + 5 }),
          event('newer'),
          event('new', { babyId: 'c' }),
        ],
      }),
      MERGE,
      NOW,
    );
    expect(plan.stats.babies).toEqual({
      add: 1,
      update: 0,
      remove: 0,
      same: 1,
      keep: 0,
      deleted: 0,
    });
    expect(plan.stats.events).toEqual({
      add: 1,
      update: 1,
      remove: 0,
      same: 1,
      keep: 1,
      deleted: 0,
    });
    expect(plan.babies.map((row) => row.id)).toEqual(['c']);
    expect(plan.events.map((row) => row.id).sort()).toEqual(['new', 'older']);
    expect(plan.stats.localEvents).toBe(4);
  });

  it('a newer deletion beats an older edit, and a newer edit beats an older deletion', () => {
    const deletedLater = event('x', {}, { deletedAt: T + 4, updatedAt: T + 4 });
    const editedEarlier = event('x', { note: 'edit' } as Partial<EventDraft>, { updatedAt: T + 1 });
    // The file's deletion is newer than the device's edit: the row is deleted.
    const incomingDeletion = planImport(
      local({ events: [editedEarlier] }),
      backup({ events: [deletedLater] }),
      MERGE,
      NOW,
    );
    expect(incomingDeletion.events).toEqual([deletedLater]);
    // Counted as a removal, not an update: the entry disappears from this phone.
    expect(incomingDeletion.stats.events).toMatchObject({ update: 0, remove: 1, deleted: 0 });
    // The device's deletion is newer than the file's edit: the device keeps it deleted.
    const deviceDeletion = planImport(
      local({ events: [deletedLater] }),
      backup({ events: [editedEarlier] }),
      MERGE,
      NOW,
    );
    expect(deviceDeletion.events).toEqual([]);
    expect(deviceDeletion.stats.events).toMatchObject({ keep: 1 });
    // An edit made after a deletion brings the row back, on either side.
    const editedLater = event('x', { note: 'edit' } as Partial<EventDraft>, { updatedAt: T + 9 });
    expect(
      planImport(local({ events: [deletedLater] }), backup({ events: [editedLater] }), MERGE, NOW)
        .events,
    ).toEqual([editedLater]);
  });

  it('imports tombstones as deleted rows and counts them apart', () => {
    const tombstone = event('gone', {}, { deletedAt: T, updatedAt: T });
    const plan = planImport(local(), backup({ events: [tombstone] }), MERGE, NOW);
    expect(plan.events).toEqual([tombstone]);
    expect(plan.stats.events).toEqual({
      add: 0,
      update: 0,
      remove: 0,
      same: 0,
      keep: 0,
      deleted: 1,
    });
  });

  it('babies follow the same rules: a newer edit updates, an older one keeps, a newer deletion removes', () => {
    const plan = planImport(
      local({
        babies: [baby('a', 'Ada'), baby('b', 'Bora', { updatedAt: T + 5 }), baby('c', 'Cem')],
      }),
      backup({
        babies: [
          baby('a', 'Ada Nur', { updatedAt: T + 1 }),
          baby('b', 'Bora B', { updatedAt: T + 1 }),
          baby('c', 'Cem', { deletedAt: T + 2, updatedAt: T + 2 }),
        ],
      }),
      MERGE,
      NOW,
    );
    expect(plan.stats.babies).toEqual({
      add: 0,
      update: 1,
      remove: 1,
      same: 0,
      keep: 1,
      deleted: 0,
    });
    expect(plan.babies.map((row) => row.id).sort()).toEqual(['a', 'c']);
    expect(plan.removedBabies).toEqual(['Cem']);
  });

  it('a live file row that revives one deleted on the device counts as an add, not an update', () => {
    const deletedHere = event('x', {}, { deletedAt: T + 1, updatedAt: T + 1 });
    const revived = event('x', { note: 'back' } as Partial<EventDraft>, { updatedAt: T + 2 });
    const plan = planImport(
      local({ events: [deletedHere] }),
      backup({ events: [revived] }),
      MERGE,
      NOW,
    );
    expect(plan.events).toEqual([revived]);
    expect(plan.stats.events).toMatchObject({ add: 1, update: 0, keep: 0, deleted: 0 });
  });

  it("keeps the device's settings and keeps only live babies in lastBabyIds", () => {
    const plan = planImport(
      local({
        babies: [baby('a'), baby('b')],
        settings: { locale: 'tr', nightMode: false, lastBabyIds: ['a', 'b', 'gone'] },
      }),
      backup({ babies: [baby('b', 'b', { deletedAt: T + 1, updatedAt: T + 1 })] }),
      MERGE,
      NOW,
    );
    expect(plan.settings).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: ['a'] });
  });
});

describe('the same baby added again', () => {
  it('pairs live babies with the same name (İ/ı and case alike) but different ids', () => {
    const pairs = findSameBabies(
      [
        baby('new-ada', 'ada'),
        baby('new-isik', 'IŞIK'),
        baby('shared', 'Bora'),
        baby('old', 'Cem', { deletedAt: T }),
      ],
      [baby('old-ada', 'Ada'), baby('old-isik', 'Işık'), baby('shared', 'Bora'), baby('x', 'Cem')],
    );
    expect(pairs).toEqual([
      { localId: 'new-ada', incomingId: 'old-ada', name: 'Ada', localName: 'ada' },
      { localId: 'new-isik', incomingId: 'old-isik', name: 'Işık', localName: 'IŞIK' },
    ]);
  });

  it('does not pair when a name matches more than one live baby on either side (ambiguous)', () => {
    // Two device babies named "Ada", one file baby named "ada": which of the two would it mean?
    const twoLocalOneFile = findSameBabies(
      [baby('l1', 'Ada'), baby('l2', 'ADA')],
      [baby('r1', 'ada')],
    );
    expect(twoLocalOneFile).toEqual([]);

    // One device baby named "Ada", two file babies named "ada": same problem, the other way round.
    const oneLocalTwoFile = findSameBabies(
      [baby('l1', 'Ada')],
      [baby('r1', 'ada'), baby('r2', 'ADA')],
    );
    expect(oneLocalTwoFile).toEqual([]);
  });

  it('skips a device baby whose name is not a string, and still plans the import', () => {
    // Device rows are never validated: a broken row must not block the restore that would repair it.
    const broken = { ...baby('broken', 'x'), name: undefined } as unknown as Baby;
    const numbered = { ...baby('numbered', 'x'), name: 42 } as unknown as Baby;
    const state = local({
      babies: [broken, numbered, baby('new-ada', 'Ada', { createdAt: T + HOUR })],
    });
    const file = backup({ babies: [baby('old-ada', 'Ada')] });
    const pairs = findSameBabies(state.babies, file.babies);
    expect(pairs).toEqual([
      { localId: 'new-ada', incomingId: 'old-ada', name: 'Ada', localName: 'Ada' },
    ]);
    expect(() => planImport(state, file, { ...MERGE, sameBabies: pairs }, NOW)).not.toThrow();
    // The file deleting such a baby does not throw either.
    const deleting = backup({
      babies: [{ ...broken, deletedAt: T + 1, updatedAt: T + 1 }, baby('old-ada', 'Ada')],
    });
    expect(() => planImport(state, deleting, MERGE, NOW)).not.toThrow();
  });

  it("moves a confirmed pair's entries to the backup's baby and deletes the device's copy", () => {
    // 'new-ada' was created on this device after a wipe, later than 'old-ada': the earlier baby survives.
    const state = local({
      babies: [baby('new-ada', 'Ada', { createdAt: T + HOUR })],
      events: [event('since-wipe', { babyId: 'new-ada' })],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: ['new-ada'] },
    });
    const file = backup({
      babies: [baby('old-ada', 'Ada')],
      events: [event('before-wipe', { babyId: 'old-ada' })],
      settings: { lastBabyIds: [] },
    });
    const pairs = findSameBabies(state.babies, file.babies);
    const plan = planImport(state, file, { ...MERGE, sameBabies: pairs }, NOW);
    expect(plan.babies).toEqual(
      expect.arrayContaining([
        baby('old-ada', 'Ada'),
        baby('new-ada', 'Ada', { createdAt: T + HOUR, deletedAt: NOW, updatedAt: NOW }),
      ]),
    );
    expect(plan.events).toEqual(
      expect.arrayContaining([
        event('before-wipe', { babyId: 'old-ada' }),
        event('since-wipe', { babyId: 'old-ada' }, { updatedAt: NOW }),
      ]),
    );
    expect(plan.settings.lastBabyIds).toEqual(['old-ada']);
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]);
    // The file's own entry is an add; only the device's entry is a move, so nothing is counted twice.
    expect(plan.stats.events).toEqual({
      add: 1,
      update: 0,
      remove: 0,
      same: 0,
      keep: 0,
      deleted: 0,
    });
    // The backup's baby survives in place of the device's: the device ends with as many babies as before.
    expect(plan.stats.babies).toEqual({
      add: 0,
      update: 0,
      remove: 0,
      same: 1,
      keep: 0,
      deleted: 0,
    });
    expect(plan.removedBabies).toEqual([]);

    // Not confirmed: both babies stay.
    const apart = planImport(state, file, MERGE, NOW);
    expect(apart.babies).toEqual([baby('old-ada', 'Ada')]);
    expect(apart.events).toEqual([event('before-wipe', { babyId: 'old-ada' })]);
  });

  it("skips a pair whose device baby the file's own row for that id already deletes", () => {
    // The file both deletes 'old' outright (same id, an ordinary edit) and offers 'old'~'new' as the same
    // child under a different id. By the time the pairing is considered, 'old' is no longer live: the pair
    // does not apply, and nothing is tombstoned by it.
    const state = local({ babies: [baby('old', 'Ada')], events: [event('e1', { babyId: 'old' })] });
    const file = backup({
      babies: [baby('old', 'Ada', { deletedAt: T + 1, updatedAt: T + 1 }), baby('new', 'Ada')],
      events: [],
    });
    const pair: SameBabyPair = { localId: 'old', incomingId: 'new', name: 'Ada', localName: 'Ada' };
    const plan = planImport(state, file, { ...MERGE, sameBabies: [pair], keepApart: ['old'] }, NOW);
    expect(plan.moves).toEqual([]);
    expect(plan.events).toEqual([]); // kept apart: e1 was never moved off 'old'
    expect(plan.hidden).toEqual([{ name: 'Ada', events: 1 }]);
    expect(plan.babies).toEqual(
      expect.arrayContaining([
        baby('old', 'Ada', { deletedAt: T + 1, updatedAt: T + 1 }),
        baby('new', 'Ada'),
      ]),
    );
    expect(plan.removedBabies).toEqual(['Ada']); // an ordinary by-id deletion, not a pairing move
    // By default e1 follows to the one other "Ada" instead of hiding with the deleted baby.
    const following = planImport(state, file, { ...MERGE, sameBabies: [pair] }, NOW);
    expect(following.events).toEqual([event('e1', { babyId: 'new' }, { updatedAt: NOW })]);
    expect(following.moves).toEqual([{ name: 'Ada', events: 1 }]);
  });

  it("also remaps a dropped baby's deleted entries, so none point at a tombstoned baby, but they are not counted in moves", () => {
    const state = local({
      babies: [baby('new-ada', 'Ada', { createdAt: T + HOUR })],
      events: [
        event('since-wipe', { babyId: 'new-ada' }),
        event('gone-since-wipe', { babyId: 'new-ada' }, { deletedAt: T + 2, updatedAt: T + 2 }),
      ],
    });
    const file = backup({ babies: [baby('old-ada', 'Ada')], events: [] });
    const pairs = findSameBabies(state.babies, file.babies);
    const plan = planImport(state, file, { ...MERGE, sameBabies: pairs }, NOW);
    expect(plan.events).toEqual(
      expect.arrayContaining([
        event('since-wipe', { babyId: 'old-ada' }, { updatedAt: NOW }),
        event('gone-since-wipe', { babyId: 'old-ada' }, { deletedAt: T + 2, updatedAt: NOW }),
      ]),
    );
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]); // only the live entry is counted
  });

  it("when the device's baby survives, the file's copy is not an added baby and its moved entries count only as moves", () => {
    // The device's 'ada-1' is older, so it survives; the file's 'ada-2' is tombstoned and its entries move onto 'ada-1'.
    const state = local({
      babies: [baby('ada-1', 'Ada')],
      events: [event('mine', { babyId: 'ada-1' })],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: ['ada-1'] },
    });
    const file = backup({
      babies: [baby('ada-2', 'ADA', { createdAt: T + HOUR }), baby('c', 'Can')],
      events: [
        event('theirs', { babyId: 'ada-2' }),
        event('theirs-deleted', { babyId: 'ada-2' }, { deletedAt: T + 1, updatedAt: T + 1 }),
        event('can', { babyId: 'c' }),
      ],
    });
    const plan = planImport(
      state,
      file,
      { ...MERGE, sameBabies: findSameBabies(state.babies, file.babies) },
      NOW,
    );
    expect(plan.babies).toEqual(
      expect.arrayContaining([
        baby('ada-2', 'ADA', { createdAt: T + HOUR, deletedAt: NOW, updatedAt: NOW }),
        baby('c', 'Can'),
      ]),
    );
    expect(plan.events).toEqual(
      expect.arrayContaining([
        event('theirs', { babyId: 'ada-1' }, { updatedAt: NOW }),
        event('theirs-deleted', { babyId: 'ada-1' }, { deletedAt: T + 1, updatedAt: NOW }),
        event('can', { babyId: 'c' }),
      ]),
    );
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]); // named after the survivor, as this device spells it
    // The tombstoned file baby is the device's own baby, so it counts as the same, not as an add.
    expect(plan.stats.babies).toEqual({
      add: 1,
      update: 0,
      remove: 0,
      same: 1,
      keep: 0,
      deleted: 0,
    });
    // Each file entry is counted once: 'theirs' in moves only, 'can' as an add, the tombstone as deleted.
    expect(plan.stats.events).toEqual({
      add: 1,
      update: 0,
      remove: 0,
      same: 0,
      keep: 0,
      deleted: 1,
    });
    expect(plan.removedBabies).toEqual([]);
  });
});

describe('the same baby added again: cross-merge converges', () => {
  it('two phones that each added "Ada" independently converge on the same survivor, in either merge order', () => {
    const phoneA = local({
      babies: [baby('ada-1', 'Ada')],
      events: [event('a-only', { babyId: 'ada-1' })],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: ['ada-1'] },
    });
    const phoneB = local({
      babies: [baby('ada-2', 'Ada')],
      events: [event('b-only', { babyId: 'ada-2' })],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: ['ada-2'] },
    });
    // Each phone's own export of itself, so the other can import it.
    const backupOfA = backup({
      babies: [baby('ada-1', 'Ada')],
      events: [event('a-only', { babyId: 'ada-1' })],
      settings: { lastBabyIds: ['ada-1'] },
    });
    const backupOfB = backup({
      babies: [baby('ada-2', 'Ada')],
      events: [event('b-only', { babyId: 'ada-2' })],
      settings: { lastBabyIds: ['ada-2'] },
    });

    const planA = planImport(
      phoneA,
      backupOfB,
      { ...MERGE, sameBabies: findSameBabies(phoneA.babies, backupOfB.babies) },
      NOW,
    );
    const planB = planImport(
      phoneB,
      backupOfA,
      { ...MERGE, sameBabies: findSameBabies(phoneB.babies, backupOfA.babies) },
      NOW,
    );

    // Tie-break by id ('ada-1' < 'ada-2'): both phones pick the same survivor without negotiating.
    expect(planA.moves).toEqual([{ name: 'Ada', events: 1 }]);
    expect(planB.moves).toEqual([{ name: 'Ada', events: 1 }]);
    expect(planA.settings.lastBabyIds).toEqual(['ada-1']);
    expect(planB.settings.lastBabyIds).toEqual(['ada-1']);

    // Applying each plan on top of its own device converges to one live "Ada" holding both entries.
    for (const state of [applyPlan(phoneA, planA), applyPlan(phoneB, planB)]) {
      const liveBabies = state.babies.filter((baby) => baby.deletedAt === undefined);
      expect(liveBabies.map((baby) => baby.id)).toEqual(['ada-1']);
      const liveEvents = state.events.filter((event) => event.deletedAt === undefined);
      expect(liveEvents.map((event) => event.babyId)).toEqual(['ada-1', 'ada-1']);
      expect(liveEvents.map((event) => event.id).sort()).toEqual(['a-only', 'b-only']);
    }
  });
});

describe('the same baby: a later exchange after one phone paired them', () => {
  // Phone A holds the older Ada ('a'), phone B the newer one ('b'). A imports B's backup and pairs them:
  // 'a' survives, 'b' is deleted and its entries move onto 'a'. B keeps logging on 'b' until it imports
  // A's backup back, which deletes 'b' there too.
  const T1 = T + 2 * HOUR; // A imports B
  const T2 = T + 3 * HOUR; // B logs one more
  const T3 = T + 4 * HOUR; // B imports A
  const T4 = T + 5 * HOUR; // A imports B again
  const phoneA = local({
    babies: [baby('a', 'Ada')],
    events: [event('a1', { babyId: 'a' })],
    settings: { locale: 'tr', nightMode: false, lastBabyIds: ['a'] },
  });
  const phoneB = local({
    babies: [baby('b', 'Ada', { createdAt: T + HOUR, updatedAt: T + HOUR })],
    events: [
      event('b1', { babyId: 'b', startAt: T + HOUR }, { createdAt: T + HOUR, updatedAt: T + HOUR }),
    ],
    settings: { locale: 'tr', nightMode: false, lastBabyIds: ['b'] },
  });
  const exportOf = (state: LocalState, exportedAt: number) =>
    backup({
      babies: [...state.babies],
      events: [...state.events],
      settings: { lastBabyIds: state.settings.lastBabyIds },
      exportedAt,
    });
  const merge = (
    state: LocalState,
    file: ParsedBackup,
    now: number,
    options: Partial<ImportOptions> = {},
  ) => {
    const plan = planImport(
      state,
      file,
      { ...MERGE, sameBabies: findSameBabies(state.babies, file.babies), ...options },
      now,
    );
    return { plan, after: applyPlan(state, plan) };
  };
  const liveBabyIds = (state: LocalState) =>
    new Set(state.babies.filter((row) => row.deletedAt === undefined).map((row) => row.id));
  const visible = (state: LocalState) =>
    state.events
      .filter(
        (row) =>
          row.deletedAt === undefined && row.babyId !== null && liveBabyIds(state).has(row.babyId),
      )
      .map((row) => `${row.id}@${row.babyId}`)
      .sort();

  const first = merge(phoneA, exportOf(phoneB, T1), T1).after;
  const b2 = event('b2', { babyId: 'b', startAt: T2 }, { createdAt: T2, updatedAt: T2 });
  const phoneBLater: LocalState = { ...phoneB, events: [...phoneB.events, b2] };

  it('moves the entries logged on the deleted baby onto the one other baby of that name, and both phones converge', () => {
    expect(visible(first)).toEqual(['a1@a', 'b1@a']);

    const { plan, after: second } = merge(phoneBLater, exportOf(first, T1), T3);
    expect(plan.removedBabies).toEqual(['Ada']);
    expect(plan.follows).toEqual([{ localId: 'b', name: 'Ada', survivorName: 'Ada' }]);
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]);
    expect(plan.hidden).toEqual([]);
    expect(plan.events).toEqual(expect.arrayContaining([{ ...b2, babyId: 'a', updatedAt: T3 }]));
    expect(plan.settings.lastBabyIds).toEqual(['a']);
    // Nothing live is left on a deleted baby.
    expect(
      second.events.filter(
        (row) => row.deletedAt === undefined && !liveBabyIds(second).has(row.babyId!),
      ),
    ).toEqual([]);
    expect(visible(second)).toEqual(['a1@a', 'b1@a', 'b2@a']);

    const third = merge(first, exportOf(second, T3), T4).after;
    expect(visible(third)).toEqual(visible(second));
    expect([...liveBabyIds(third)]).toEqual(['a']);
  });

  it('left apart on request, the entries stay with the deleted baby and the preview says how many will be hidden', () => {
    const { plan, after } = merge(phoneBLater, exportOf(first, T1), T3, { keepApart: ['b'] });
    expect(plan.follows).toEqual([{ localId: 'b', name: 'Ada', survivorName: 'Ada' }]);
    expect(plan.moves).toEqual([]);
    expect(plan.hidden).toEqual([{ name: 'Ada', events: 1 }]);
    expect(after.events.find((row) => row.id === 'b2')).toEqual(b2);
  });

  it("a deleted baby's own deleted entries stay where they are; only the live ones move", () => {
    const gone = event('gone', { babyId: 'b' }, { deletedAt: T2, updatedAt: T2 });
    const { plan } = merge(
      { ...phoneBLater, events: [...phoneBLater.events, gone] },
      exportOf(first, T1),
      T3,
    );
    expect(plan.events.find((row) => row.id === 'gone')).toBeUndefined();
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]);
  });

  it('with no single other baby of that name, nothing moves and the preview counts the entries to be hidden', () => {
    const deleting = backup({ babies: [baby('c', 'Cem', { deletedAt: T + 1, updatedAt: T + 1 })] });
    const alone = local({
      babies: [baby('c', 'Cem')],
      events: [event('c1', { babyId: 'c' }), event('c2', { babyId: 'c' })],
    });
    const plan = planImport(alone, deleting, MERGE, NOW);
    expect(plan.follows).toEqual([]);
    expect(plan.moves).toEqual([]);
    expect(plan.hidden).toEqual([{ name: 'Cem', events: 2 }]);

    // Two other live babies named "Cem": which one would it mean? Nothing is guessed.
    const twins = local({
      babies: [...alone.babies, baby('c2', 'CEM'), baby('c3', 'cem')],
      events: alone.events,
    });
    const ambiguous = planImport(twins, deleting, MERGE, NOW);
    expect(ambiguous.follows).toEqual([]);
    expect(ambiguous.hidden).toEqual([{ name: 'Cem', events: 2 }]);
    // A deleted baby with no live entries is not mentioned at all.
    expect(planImport(local({ babies: [baby('c', 'Cem')] }), deleting, MERGE, NOW).hidden).toEqual(
      [],
    );
  });

  it('the paired phone importing again: entries the other phone logged on the deleted baby since come in under the kept one', () => {
    // A paired first ('b' is deleted on A); B logs b2 on 'b' and A imports B again, before B ever imports A.
    const fileOfB = exportOf(phoneBLater, T3);
    const { plan, after: second } = merge(first, fileOfB, T3);
    expect(plan.follows).toEqual([{ localId: 'b', name: 'Ada', survivorName: 'Ada' }]);
    expect(plan.moves).toEqual([{ name: 'Ada', events: 1 }]);
    expect(plan.hidden).toEqual([]);
    expect(plan.stats.events.add).toBe(0); // counted as moved, not as a plain add
    expect(plan.events).toEqual([{ ...b2, babyId: 'a', updatedAt: T3 }]);
    expect(visible(second)).toEqual(['a1@a', 'b1@a', 'b2@a']);

    // The same file again changes nothing: no ping-pong.
    const again = merge(second, fileOfB, T4);
    expect(again.plan.events).toEqual([]);
    expect(again.plan.moves).toEqual([]);
    expect(again.plan.follows).toEqual([]);
    // B then imports A: both phones end up the same.
    const onB = merge(phoneBLater, exportOf(second, T4), T4).after;
    expect(visible(onB)).toEqual(visible(second));
    expect([...liveBabyIds(onB)]).toEqual(['a']);
  });

  it("kept apart, or with no single baby of that name, the file's entries on a deleted baby are counted as hidden", () => {
    const fileOfB = exportOf(phoneBLater, T3);
    const apart = planImport(first, fileOfB, { ...MERGE, keepApart: ['b'] }, T3);
    expect(apart.follows).toEqual([{ localId: 'b', name: 'Ada', survivorName: 'Ada' }]);
    expect(apart.moves).toEqual([]);
    expect(apart.hidden).toEqual([{ name: 'Ada', events: 1 }]);
    expect(apart.events).toEqual([b2]);

    // Two live "Ada"s on this phone: which one would it mean? Nothing is guessed.
    const twins: LocalState = { ...first, babies: [...first.babies, baby('a2', 'ADA')] };
    const ambiguous = planImport(twins, fileOfB, MERGE, T3);
    expect(ambiguous.follows).toEqual([]);
    expect(ambiguous.hidden).toEqual([{ name: 'Ada', events: 1 }]);
    expect(planSignature(ambiguous)).not.toBe(planSignature(planImport(first, fileOfB, MERGE, T3)));
  });

  it('the signature covers what follows and what is hidden', () => {
    const file = exportOf(first, T1);
    const following = planImport(phoneBLater, file, MERGE, T3);
    const apart = planImport(phoneBLater, file, { ...MERGE, keepApart: ['b'] }, T3);
    expect(planSignature(apart)).not.toBe(planSignature(following));
  });
});

describe('saved mixes merge like babies', () => {
  it('adds, updates, keeps, deletes and counts mixes by id; two same-named mixes both survive', () => {
    const state = local({
      mixes: [
        mix('m1'),
        mix('m2', 'Öğlen', { updatedAt: T + 5 }),
        mix('m3', 'Eski'),
        mix('m4', 'Gece'),
      ],
    });
    const file = backup({
      mixes: [
        mix('m1', 'Gece', { layers: [{ soundId: 'rain', gain: 0.4 }], updatedAt: T + 1 }), // newer: updates
        mix('m2', 'Öğlen', { updatedAt: T + 1 }), // older: kept
        mix('m3', 'Eski', { deletedAt: T + 2, updatedAt: T + 2 }), // deleted on the other phone: removed
        mix('m5', 'Gece'), // new, with the same name as m4: both stay
      ],
    });
    const plan = planImport(state, file, MERGE, NOW);
    expect(plan.stats.mixes).toEqual({
      add: 1,
      update: 1,
      remove: 1,
      same: 0,
      keep: 1,
      deleted: 0,
    });
    expect(plan.stats.localMixes).toBe(4);
    expect(plan.mixes.map((row) => row.id).sort()).toEqual(['m1', 'm3', 'm5']);
    const after = applyPlan(state, plan);
    expect(
      after.mixes
        .filter((row) => row.deletedAt === undefined)
        .map((row) => row.name)
        .sort(),
    ).toEqual(['Gece', 'Gece', 'Gece', 'Öğlen']);
    expect(after.mixes.find((row) => row.id === 'm1')?.layers).toEqual([
      { soundId: 'rain', gain: 0.4 },
    ]);
  });

  it('equal updatedAt with different layers: both phones converge on the same copy', () => {
    const mine = mix('m1', 'Gece', { layers: [{ soundId: 'white', gain: 0.7 }] });
    const theirs = mix('m1', 'Gece', { layers: [{ gain: 0.2, soundId: 'rain' }] });
    const fromA = applyPlan(
      local({ mixes: [mine] }),
      planImport(local({ mixes: [mine] }), backup({ mixes: [theirs] }), MERGE, NOW),
    );
    const fromB = applyPlan(
      local({ mixes: [theirs] }),
      planImport(local({ mixes: [theirs] }), backup({ mixes: [mine] }), MERGE, NOW),
    );
    expect(fromA.mixes).toEqual(fromB.mixes);
    expect(
      planImport(
        local({ mixes: [mine] }),
        backup({ mixes: [{ ...mine, layers: [{ gain: 0.7, soundId: 'white' }] }] }),
        MERGE,
        NOW,
      ).stats.mixes.same,
    ).toBe(1);
  });

  it('the signature covers the mixes', () => {
    const one = planImport(local(), backup({ mixes: [mix('m1')] }), MERGE, NOW);
    const none = planImport(local(), backup(), MERGE, NOW);
    expect(planSignature(one)).not.toBe(planSignature(none));
  });
});

describe('planImport: replace', () => {
  it("writes the file's mixes and counts the device's live mixes that go", () => {
    const plan = planImport(
      local({ mixes: [mix('m1'), mix('m2', 'Eski', { deletedAt: T })] }),
      backup({ mixes: [mix('m9', 'Yeni')] }),
      REPLACE,
      NOW,
    );
    expect(plan.mixes).toEqual([mix('m9', 'Yeni')]);
    expect(plan.stats.mixes).toEqual({
      add: 1,
      update: 0,
      remove: 0,
      same: 0,
      keep: 0,
      deleted: 0,
    });
    expect(plan.stats.localMixes).toBe(1);
  });

  it("writes the file's rows and takes its language and night mode", () => {
    const file = backup({
      babies: [baby('a'), baby('z', 'z', { deletedAt: T })],
      events: [event('e1'), event('e2', {}, { deletedAt: T })],
    });
    const plan = planImport(local({ events: [event('mine')] }), file, REPLACE, NOW);
    expect(plan.babies).toEqual(file.babies);
    expect(plan.events).toEqual(file.events);
    expect(plan.settings).toEqual({ locale: 'en', nightMode: true, lastBabyIds: ['a'] });
    expect(plan.stats).toMatchObject({
      localBabies: 1,
      localEvents: 1,
      events: { add: 1, deleted: 1 },
      babies: { add: 1, deleted: 1 },
    });
    expect(plan.removedBabies).toEqual([]);
    expect(plan.moves).toEqual([]);
  });

  it("keeps the device's own value for a setting the file could not supply", () => {
    const plan = planImport(local(), backup({ settings: { lastBabyIds: [] } }), REPLACE, NOW);
    expect(plan.settings).toEqual({ locale: 'tr', nightMode: false, lastBabyIds: [] });
  });

  it('drops a dead id from lastBabyIds: missing from the file, or a tombstone in it', () => {
    const plan = planImport(
      local(),
      backup({
        babies: [baby('a'), baby('z', 'z', { deletedAt: T })],
        settings: { lastBabyIds: ['a', 'z', 'missing'] },
      }),
      REPLACE,
      NOW,
    );
    expect(plan.settings.lastBabyIds).toEqual(['a']);
  });

  it('counts the device entries that replace would lose: missing from the file, or changed after it', () => {
    const plan = planImport(
      local({
        events: [
          event('in-file'),
          event('changed-after', {}, { updatedAt: T + 2 * HOUR }),
          event('new-here', { startAt: T + 3 * HOUR }),
          event('deleted-here', {}, { deletedAt: T }),
        ],
      }),
      backup({ events: [event('in-file'), event('changed-after')] }),
      REPLACE,
      NOW,
    );
    expect(plan.loss).toEqual({ events: 2, newestAt: T + 3 * HOUR, mixes: 0 });
  });

  it('counts the device mixes that replace would lose the same way: missing from the file, or changed after it', () => {
    const plan = planImport(
      local({
        mixes: [
          mix('in-file'),
          mix('changed-after', 'Gece', { updatedAt: T + 2 * HOUR }),
          mix('new-here', 'Gece'),
          mix('deleted-here', 'Eski', { deletedAt: T }),
        ],
      }),
      backup({ mixes: [mix('in-file'), mix('changed-after')] }),
      REPLACE,
      NOW,
    );
    expect(plan.loss).toEqual({ events: 0, newestAt: null, mixes: 2 });
  });
});

describe('planSignature', () => {
  it('changes when what the plan would do changes', () => {
    const before = planImport(local(), backup({ events: [event('x')] }), MERGE, NOW);
    const same = planImport(local(), backup({ events: [event('x')] }), MERGE, NOW + MINUTE);
    const after = planImport(
      local({ events: [event('x')] }),
      backup({ events: [event('x')] }),
      MERGE,
      NOW,
    );
    expect(planSignature(same)).toBe(planSignature(before));
    expect(planSignature(after)).not.toBe(planSignature(before));
  });
});

describe('planImport: running timers', () => {
  const running = (id: string, startAt: number, babyId = 'a') =>
    ({
      id,
      type: 'sleep',
      babyId,
      startAt,
      createdAt: startAt,
      updatedAt: startAt,
    }) as TrackerEvent;

  it('merge: a running breastfeed on each side for one baby leaves only the later one running', () => {
    const theirs = {
      id: 'theirs',
      type: 'breastfeed',
      babyId: 'a',
      startAt: T,
      segments: [
        { side: 'L', start: T, end: T + 20 * MINUTE },
        { side: 'R', start: T + 20 * MINUTE },
      ],
      createdAt: T,
      updatedAt: T,
    } as TrackerEvent;
    const mine = {
      id: 'mine',
      type: 'breastfeed',
      babyId: 'a',
      startAt: T + 10 * MINUTE,
      segments: [{ side: 'L', start: T + 10 * MINUTE }],
      createdAt: T,
      updatedAt: T,
    } as TrackerEvent;
    const plan = planImport(
      local({ events: [mine] }),
      backup({ events: [theirs] }),
      { ...MERGE, stopStale: false },
      T + HOUR,
    );
    // Stopped when the later feed began, but never before its own current side began (06:20, not 06:10).
    expect(plan.stopped).toEqual([
      {
        id: 'theirs',
        babyId: 'a',
        type: 'breastfeed',
        startAt: T,
        stopAt: T + 20 * MINUTE,
        reason: 'collision',
      },
    ]);
    expect(plan.events).toEqual([
      {
        ...theirs,
        endAt: T + 20 * MINUTE,
        segments: [
          { side: 'L', start: T, end: T + 20 * MINUTE },
          { side: 'R', start: T + 20 * MINUTE, end: T + 20 * MINUTE },
        ],
        updatedAt: T + HOUR,
      },
    ]);
  });

  it('merge: the stale option stops an old running timer from the file at the time of the backup', () => {
    const state = local({ events: [running('mine', T + 2 * HOUR)] });
    const file = backup({ events: [running('theirs', T)], exportedAt: T + HOUR });
    const stopping = planImport(state, file, MERGE, T + 3 * HOUR);
    expect(stopping.stale).toEqual([{ id: 'theirs', babyId: 'a', type: 'sleep', startAt: T }]);
    expect(stopping.stopped).toMatchObject([{ id: 'theirs', stopAt: T + HOUR, reason: 'stale' }]);
    const keeping = planImport(state, file, { ...MERGE, stopStale: false }, T + 3 * HOUR);
    expect(keeping.stale).toHaveLength(1);
    expect(keeping.stopped).toMatchObject([
      { id: 'theirs', stopAt: T + 2 * HOUR, reason: 'collision' },
    ]);
  });

  it("replace: two running sleeps inside the file are repaired too, and a deleted baby's timer stops", () => {
    const file = backup({
      babies: [
        baby('a', 'Ada'),
        baby('gone', 'Gone', { deletedAt: T + HOUR, updatedAt: T + HOUR }),
      ],
      events: [running('one', T), running('two', T + 30 * MINUTE), running('orphan', T, 'gone')],
      exportedAt: T + 2 * HOUR,
    });
    const plan = planImport(local(), file, { ...REPLACE, stopStale: false }, T + 2 * HOUR);
    expect(plan.stopped.map((timer) => [timer.id, timer.reason, timer.stopAt])).toEqual([
      ['orphan', 'deleted-baby', T + HOUR],
      ['one', 'collision', T + 30 * MINUTE],
    ]);
    expect(
      plan.events.filter((event) => event.endAt === undefined).map((event) => event.id),
    ).toEqual(['two']);
  });

  it("a same-baby pair: the device's running timer and the file's collide on the one baby", () => {
    // 'new-ada' was added on this device after the wipe, later than 'old-ada', so the backup's baby survives.
    const state = local({
      babies: [baby('new-ada', 'Ada', { createdAt: T + HOUR })],
      events: [running('since-wipe', T + 2 * HOUR, 'new-ada')],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: [] },
    });
    const file = backup({
      babies: [baby('old-ada', 'Ada')],
      events: [running('before-wipe', T, 'old-ada')],
      exportedAt: T + HOUR,
    });
    const plan = planImport(
      state,
      file,
      { ...MERGE, sameBabies: findSameBabies(state.babies, file.babies), stopStale: false },
      T + 3 * HOUR,
    );
    const stillRunning = plan.events.filter((event) => event.endAt === undefined);
    expect(stillRunning.map((event) => [event.id, event.babyId])).toEqual([
      ['since-wipe', 'old-ada'],
    ]);
    expect(plan.stopped).toMatchObject([
      { id: 'before-wipe', reason: 'collision', stopAt: T + 2 * HOUR },
    ]);
  });

  it("a same-baby pair where the device's baby survives: the file's timer moves onto it, collides and is judged stale", () => {
    const state = local({
      babies: [baby('ada-1', 'Ada')],
      events: [running('since', T + 2 * HOUR, 'ada-1')],
      settings: { locale: 'tr', nightMode: false, lastBabyIds: [] },
    });
    const file = backup({
      babies: [baby('ada-2', 'Ada', { createdAt: T + HOUR })],
      events: [running('before', T, 'ada-2')],
      exportedAt: T + HOUR,
    });
    const options = { ...MERGE, sameBabies: findSameBabies(state.babies, file.babies) };
    const keeping = planImport(state, file, { ...options, stopStale: false }, T + 3 * HOUR);
    const after = applyPlan(state, keeping).events.filter(
      (event) => event.deletedAt === undefined && event.endAt === undefined,
    );
    expect(after.map((event) => [event.id, event.babyId])).toEqual([['since', 'ada-1']]);
    expect(keeping.stopped).toMatchObject([
      { id: 'before', babyId: 'ada-1', reason: 'collision', stopAt: T + 2 * HOUR },
    ]);
    // Judged against the device's own sleep on the surviving baby, the file's timer is stale.
    const stopping = planImport(state, file, options, T + 3 * HOUR);
    expect(stopping.stale).toEqual([{ id: 'before', babyId: 'ada-1', type: 'sleep', startAt: T }]);
    expect(stopping.stopped).toMatchObject([{ id: 'before', reason: 'stale', stopAt: T + HOUR }]);
  });

  it('a stale stop never beats a real stop made later on the other phone', () => {
    const file = backup({ events: [running('s', T)], exportedAt: T + HOUR });
    const first = planImport(local(), file, MERGE, T + 3 * DAY);
    const [stopped] = first.events;
    expect(stopped).toMatchObject({ endAt: T + HOUR, updatedAt: T + HOUR });
    const device = local({ events: first.events });
    // The partner really ended the sleep 8 hours after the backup was taken.
    const real = { ...running('s', T), endAt: T + 9 * HOUR, updatedAt: T + 9 * HOUR };
    expect(
      planImport(device, backup({ events: [real], exportedAt: T + 10 * HOUR }), MERGE, T + 3 * DAY)
        .stats.events,
    ).toMatchObject({ update: 1 });
    // The first file again changes nothing.
    expect(planImport(device, file, MERGE, T + 3 * DAY).stats.events).toMatchObject({ keep: 1 });
  });

  it("merge: a deleted baby's running timer from the file stops when the baby was deleted", () => {
    const state = local({
      babies: [baby('a', 'Ada', { deletedAt: T + HOUR, updatedAt: T + HOUR })],
    });
    const plan = planImport(
      state,
      backup({ babies: [], events: [running('s', T)] }),
      { ...MERGE, stopStale: false },
      T + 2 * HOUR,
    );
    expect(plan.stopped).toMatchObject([{ id: 's', reason: 'deleted-baby', stopAt: T + HOUR }]);
  });

  it("a newer, finished copy on the device keeps the file's running copy out, and it is not called stale", () => {
    const state = local({ events: [{ ...running('s', T), endAt: T + HOUR, updatedAt: T + HOUR }] });
    const plan = planImport(state, backup({ events: [running('s', T)] }), MERGE, T + DAY);
    expect(plan.stats.events).toMatchObject({ keep: 1 });
    expect(plan.stale).toEqual([]);
    expect(plan.events).toEqual([]);
  });

  it('a malformed running feed on the device does not stop the preview', () => {
    const broken = {
      id: 'broken',
      type: 'breastfeed',
      babyId: 'a',
      startAt: T,
      segments: 'broken',
      createdAt: T,
      updatedAt: T,
    } as unknown as TrackerEvent;
    const theirs = {
      id: 'theirs',
      type: 'breastfeed',
      babyId: 'a',
      startAt: T + 10 * MINUTE,
      segments: [{ side: 'L', start: T + 10 * MINUTE }],
      createdAt: T,
      updatedAt: T,
    } as TrackerEvent;
    const plan = planImport(
      local({ events: [broken] }),
      backup({ events: [theirs] }),
      { ...MERGE, stopStale: false },
      T + HOUR,
    );
    expect(plan.stopped).toMatchObject([{ id: 'broken', reason: 'collision' }]);
    expect(plan.events).toEqual(
      expect.arrayContaining([{ ...broken, endAt: T + 10 * MINUTE, updatedAt: T + HOUR }]),
    );
  });
});
