import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, serializeBackup } from '../../src/backup/export';
import { BACKUP_VERSION } from '../../src/backup/format';
import {
  MAX_BACKUP_BYTES,
  PROBLEM_CODES,
  checkFileSize,
  parseBackup,
  type ParseResult,
  type ProblemCode,
} from '../../src/backup/validate';
import type { Settings } from '../../src/db/settings';
import { DAY, HOUR, MINUTE } from '../../src/domain/time';
import type { Baby, BreastSegment, EventDraft, TrackerEvent } from '../../src/domain/types';
import { buildDrafts, type SheetInput } from '../../src/ui/log/drafts';
import { eventToInput, inputToDraft } from '../../src/ui/log/edits';

let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const NOW = Date.UTC(2026, 8, 26, 7, 0);
const T = NOW - 2 * DAY;

const baby = (id = 'b1', extra: Partial<Baby> = {}): Baby => ({
  id,
  name: 'Ada',
  color: '#7cb7ff',
  archived: false,
  createdAt: T,
  updatedAt: T,
  ...extra,
});
const event = (draft: EventDraft, id = 'e1', extra: Partial<TrackerEvent> = {}): TrackerEvent =>
  ({ ...draft, id, createdAt: T, updatedAt: T, ...extra }) as TrackerEvent;
const sleep = (id = 'e1', extra: Partial<TrackerEvent> = {}) =>
  event({ type: 'sleep', babyId: 'b1', startAt: T, endAt: T + HOUR }, id, extra);
/** A file as the app writes it, with rows that may be anything. */
function file(parts: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'qundaq',
    schemaVersion: BACKUP_VERSION,
    exportedAt: T,
    appVersion: '0.1.0',
    babies: [baby()],
    events: [],
    settings: { locale: 'tr', nightMode: false },
    ...parts,
  });
}

function ok(result: ParseResult) {
  if (!result.ok) throw new Error(`expected a readable file, got ${result.error}`);
  return result;
}

describe('fatal problems refuse the whole file', () => {
  it.each([
    ['not JSON', 'hello'],
    ['JSON that is not an object', '[1,2]'],
    ['another app', file({ app: 'other' })],
    ['no version', file({ schemaVersion: undefined })],
    ['a version that is not an integer', file({ schemaVersion: 1.5 })],
    ['version 0', file({ schemaVersion: 0 })],
    ['babies not a list', file({ babies: {} })],
    ['events not a list', file({ events: null })],
    ['no export time', file({ exportedAt: 'yesterday' })],
    ['an export time no date can show', file({ exportedAt: 1e300 })],
  ])('%s', (_label, text) => {
    expect(parseBackup(text, NOW)).toEqual({ ok: false, error: 'not-backup' });
  });

  it('a file from a newer version of the app', () => {
    expect(parseBackup(file({ schemaVersion: BACKUP_VERSION + 1 }), NOW)).toEqual({
      ok: false,
      error: 'newer-version',
    });
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(ok(parseBackup(`\uFEFF${file()}`, NOW)).backup.babies).toEqual([baby()]);
  });

  it('a value just above the usable time range is not-backup', () => {
    expect(parseBackup(file({ exportedAt: 253402300800000 }), NOW)).toEqual({
      ok: false,
      error: 'not-backup',
    });
  });
});

describe('rows that fail their checks are skipped and reported', () => {
  const cases: [ProblemCode, Record<string, unknown>][] = [
    ['not-object', { events: [42] }],
    ['bad-id', { events: [{ ...sleep(), id: '' }] }],
    ['duplicate-id', { events: [sleep('same'), sleep('same', { note: 'second' })] }],
    ['bad-time', { events: [{ ...sleep(), endAt: T - 1 }] }],
    ['bad-baby', { babies: [baby(), { ...baby('b2'), color: 'blue' }] }],
    ['unknown-type', { events: [{ ...sleep(), type: 'nap' }] }],
    [
      'bad-payload',
      { events: [event({ type: 'breastfeed', babyId: 'b1', startAt: T, endAt: T, segments: [] })] },
    ],
    ['bad-field', { events: [{ ...sleep(), note: 5 }] }],
    ['missing-baby', { events: [{ ...sleep(), babyId: 'nobody' }] }],
  ];

  it('covers every problem code', () => {
    expect(cases.map(([code]) => code).sort()).toEqual([...PROBLEM_CODES].sort());
  });

  it.each(cases)('%s', (code, parts) => {
    const { skipped } = ok(parseBackup(file(parts), NOW));
    expect(skipped.map((row) => row.code)).toEqual([code]);
  });

  it('names a skipped event by what could be read of it', () => {
    const bad = { ...sleep(), type: 'breastfeed', segments: 'none' };
    const { skipped, backup } = ok(parseBackup(file({ events: [sleep('good'), bad] }), NOW));
    expect(skipped).toEqual([
      { list: 'events', index: 1, code: 'bad-payload', type: 'breastfeed', startAt: T },
    ]);
    expect(backup.events.map((row) => row.id)).toEqual(['good']);
  });

  it('skips the events of a skipped baby, and keeps the later duplicate out', () => {
    const { skipped, backup } = ok(
      parseBackup(
        file({
          babies: [baby(), { ...baby('b2'), name: '  ' }],
          events: [sleep('e1'), { ...sleep('e2'), babyId: 'b2' }],
        }),
        NOW,
      ),
    );
    expect(backup.babies.map((row) => row.id)).toEqual(['b1']);
    expect(skipped.map((row) => [row.list, row.index, row.code])).toEqual([
      ['babies', 1, 'bad-baby'],
      ['events', 1, 'missing-baby'],
    ]);
  });

  it.each([
    ['a side that is not L or R', [{ side: 'X', start: T, end: T + 1 }]],
    ['a side ending before it starts', [{ side: 'L', start: T + 5, end: T }]],
    [
      'overlapping sides',
      [
        { side: 'L', start: T, end: T + 10 },
        { side: 'R', start: T + 5, end: T + 20 },
      ],
    ],
    [
      'an open side that is not the last',
      [
        { side: 'L', start: T },
        { side: 'R', start: T + 5, end: T + 20 },
      ],
    ],
  ])('breastfeed: %s', (_label, segments) => {
    const feed = {
      ...event({ type: 'breastfeed', babyId: 'b1', startAt: T, endAt: T + 20, segments: [] }),
      segments,
    };
    expect(ok(parseBackup(file({ events: [feed] }), NOW)).skipped.map((row) => row.code)).toEqual([
      'bad-payload',
    ]);
  });

  it('a finished breastfeed needs every side closed; a running one may have its last side open', () => {
    const open = [{ side: 'L', start: T }];
    const finished = {
      ...event({ type: 'breastfeed', babyId: 'b1', startAt: T, endAt: T + 20, segments: [] }, 'f'),
      segments: open,
    };
    const running = {
      ...event({ type: 'breastfeed', babyId: 'b1', startAt: T, segments: [] }, 'r'),
      segments: open,
    };
    const result = ok(parseBackup(file({ events: [finished, running] }), NOW));
    expect(result.skipped.map((row) => row.index)).toEqual([0]);
    expect(result.backup.events.map((row) => row.id)).toEqual(['r']);
  });

  it.each([
    ['bottle over 1000 ml', { type: 'bottle', ml: 1001, contents: 'formula' }],
    ['bottle of an unknown kind', { type: 'bottle', ml: 90, contents: 'juice' }],
    ['diaper with a made-up color', { type: 'diaper', wet: true, dirty: true, stoolColor: 'blue' }],
    ['pump with no amount', { type: 'pump', babyId: null }],
    ['pump of 0 ml', { type: 'pump', babyId: null, mlLeft: 0 }],
    ['growth out of range', { type: 'growth', weightG: 50_000 }],
    ['temperature out of range', { type: 'temperature', celsius: 50 }],
    ['medicine without a name', { type: 'medication', name: '   ' }],
    ['health note without text', { type: 'healthNote', note: '  ' }],
  ])('%s', (_label, payload) => {
    const row = { id: 'x', babyId: 'b1', startAt: T, createdAt: T, updatedAt: T, ...payload };
    expect(ok(parseBackup(file({ events: [row] }), NOW)).skipped.map((skip) => skip.code)).toEqual([
      'bad-payload',
    ]);
  });

  it('a time that no date can show is a bad time, and is not reported', () => {
    const { skipped } = ok(
      parseBackup(file({ events: [{ ...sleep(), startAt: 1e20, endAt: undefined }] }), NOW),
    );
    expect(skipped).toEqual([{ list: 'events', index: 0, code: 'bad-time', type: 'sleep' }]);
    const feed = {
      ...event({ type: 'breastfeed', babyId: 'b1', startAt: T, segments: [] }),
      segments: [{ side: 'L', start: T, end: 9e15 }],
    };
    expect(ok(parseBackup(file({ events: [feed] }), NOW)).skipped.map((row) => row.code)).toEqual([
      'bad-payload',
    ]);
  });

  it('a pump that names a baby is a bad field', () => {
    const row = {
      id: 'x',
      type: 'pump',
      babyId: 'b1',
      mlLeft: 60,
      startAt: T,
      createdAt: T,
      updatedAt: T,
    };
    expect(ok(parseBackup(file({ events: [row] }), NOW)).skipped.map((skip) => skip.code)).toEqual([
      'bad-field',
    ]);
  });

  it('keeps a later duplicate when the earlier row sharing its id was itself broken (never claimed the id)', () => {
    const broken = { ...sleep('e1'), endAt: T - 1 }; // bad-time: never adds 'e1' to the seen set
    const good = sleep('e1');
    const { skipped, backup } = ok(parseBackup(file({ events: [broken, good] }), NOW));
    expect(skipped.map((row) => [row.index, row.code])).toEqual([[0, 'bad-time']]);
    expect(backup.events.map((row) => row.id)).toEqual(['e1']);
  });

  it("does not report a skipped event's own `name` field (a medicine) as if it were a baby name", () => {
    const row = {
      id: 'x',
      type: 'medication',
      babyId: 'nobody',
      startAt: T,
      createdAt: T,
      updatedAt: T,
      name: 'Parol',
    };
    const { skipped } = ok(parseBackup(file({ events: [row] }), NOW));
    expect(skipped).toEqual([
      { list: 'events', index: 0, code: 'missing-baby', type: 'medication', startAt: T },
    ]);
  });
});

describe('whitelisting', () => {
  it('builds new rows from the known fields only', () => {
    const text = file({
      babies: [{ ...baby(), isAdmin: true }],
      events: [
        JSON.parse(
          '{"id":"e1","type":"sleep","babyId":"b1","startAt":1,"createdAt":1,"updatedAt":1,"open":1,"extra":2,"__proto__":{"polluted":true},"constructor":"x"}',
        ),
      ],
    });
    const { backup } = ok(parseBackup(text, NOW));
    expect(backup.babies[0]).toEqual(baby());
    expect(backup.events[0]).toEqual({
      id: 'e1',
      type: 'sleep',
      babyId: 'b1',
      startAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(Object.getPrototypeOf(backup.events[0])).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  // Every stored field must be read back. Adding a field to Baby, an event type or Settings makes these
  // samples fail to compile (they are Required<…>); once completed, the test fails until the validator
  // knows the field.
  it('keeps every field of every stored type', () => {
    const b: Required<Baby> = {
      id: 'b1',
      name: 'Ada',
      color: '#7cb7ff',
      birthDate: '2026-09-01',
      archived: true,
      createdAt: T,
      updatedAt: T,
      deletedAt: T,
    };
    const common = {
      babyId: 'b1',
      groupId: 'g1',
      startAt: T,
      note: 'note',
      createdAt: T,
      updatedAt: T,
      deletedAt: T,
    };
    // `satisfies`, never `as`: an assertion would let a sample miss a new field without a compile error.
    type Full<K extends TrackerEvent['type']> = Required<Extract<TrackerEvent, { type: K }>>;
    const samples: TrackerEvent[] = [
      { ...common, id: 'sleep', type: 'sleep', endAt: T + 1 } satisfies Full<'sleep'>,
      {
        ...common,
        id: 'feed',
        type: 'breastfeed',
        endAt: T + 2,
        // Each side too, as `satisfies Required<BreastSegment>`: a new side field must fail tsc here.
        segments: [
          { side: 'L', start: T, end: T + 1 } satisfies Required<BreastSegment>,
          { side: 'R', start: T + 1, end: T + 2 } satisfies Required<BreastSegment>,
        ],
      } satisfies Full<'breastfeed'>,
      {
        ...common,
        id: 'bottle',
        type: 'bottle',
        endAt: T,
        ml: 90,
        contents: 'formula',
      } satisfies Full<'bottle'>,
      {
        ...common,
        id: 'diaper',
        type: 'diaper',
        endAt: T,
        wet: true,
        dirty: true,
        stoolColor: 'yellow',
        consistency: 'soft',
      } satisfies Full<'diaper'>,
      {
        ...common,
        id: 'pump',
        type: 'pump',
        babyId: null,
        endAt: T,
        mlLeft: 60,
        mlRight: 70,
      } satisfies Full<'pump'>,
      {
        ...common,
        id: 'growth',
        type: 'growth',
        endAt: T,
        weightG: 3450,
        heightMm: 525,
        headMm: 350,
      } satisfies Full<'growth'>,
      {
        ...common,
        id: 'temp',
        type: 'temperature',
        endAt: T,
        celsius: 38.2,
      } satisfies Full<'temperature'>,
      {
        ...common,
        id: 'med',
        type: 'medication',
        endAt: T,
        name: 'Vitamin D',
        dose: '400 IU',
      } satisfies Full<'medication'>,
      { ...common, id: 'health', type: 'healthNote', endAt: T } satisfies Full<'healthNote'>,
    ];
    const settings: Required<Settings> = {
      locale: 'en',
      nightMode: true,
      theme: 'light',
      lastBackupAt: T,
      backupReminderSnoozedUntil: T,
      volumeCap: 0.7,
      lastSound: { soundId: 'white', master: 0.6, timerMin: 30 },
    };
    const text = serializeBackup(
      buildBackup(
        { babies: [b], events: samples, settings },
        { exportedAt: T, appVersion: '0.1.0' },
      ),
    );
    const { backup, skipped } = ok(parseBackup(text, NOW));
    expect(skipped).toEqual([]);
    expect(backup.babies).toEqual([b]);
    expect(backup.events).toEqual(samples);
    // Device-only settings stay behind on purpose; everything else comes back.
    /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to drop the properties */
    const {
      lastBackupAt: _last,
      backupReminderSnoozedUntil: _snooze,
      volumeCap: _cap,
      lastSound: _sound,
      theme: _theme,
      ...portable
    } = settings;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    expect(backup.settings).toEqual(portable);
  });
});

describe('normalisation touches only what the app never writes', () => {
  it('drops a whitespace-only note, trims a medicine, rounds a temperature', () => {
    const rows = [
      { ...sleep('s'), note: ' \n ' },
      {
        id: 'm',
        type: 'medication',
        babyId: 'b1',
        startAt: T,
        name: '  Vitamin D ',
        dose: '   ',
        createdAt: T,
        updatedAt: T,
      },
      {
        id: 't',
        type: 'temperature',
        babyId: 'b1',
        startAt: T,
        celsius: 37.95,
        createdAt: T,
        updatedAt: T,
      },
    ];
    const { backup } = ok(parseBackup(file({ events: rows }), NOW));
    expect(backup.events[0]).not.toHaveProperty('note');
    expect(backup.events[1]).toMatchObject({ name: 'Vitamin D' });
    expect(backup.events[1]).not.toHaveProperty('dose');
    expect(backup.events[2]).toMatchObject({ celsius: 38 });
  });

  it('leaves every entry the sheets and the edit sheet can produce exactly as it is', () => {
    const inputs: [SheetInput, string][] = [
      [{ kind: 'breastfeed', value: { side: 'R', durationMin: 15 } }, ''],
      [{ kind: 'breastfeed', value: { side: 'L', durationMin: null } }, ''],
      [{ kind: 'bottle', value: { ml: 90, contents: 'mixed' } }, ''],
      [{ kind: 'sleep', value: { durationMin: 45 } }, ''],
      [
        {
          kind: 'diaper',
          value: { wet: true, dirty: true, stoolColor: 'clay', consistency: 'watery' },
        },
        '',
      ],
      [{ kind: 'pump', value: { mlLeft: '60', mlRight: '' } }, 'right side hurts '],
      [{ kind: 'growth', value: { weightKg: '3,45', heightCm: '52,5', headCm: '' } }, ''],
      [{ kind: 'temperature', value: { celsius: '37,95' } }, '\nfever broke\n'],
      [{ kind: 'temperature', value: { celsius: '36.6' } }, ''],
      [{ kind: 'medication', value: { name: ' Vitamin D ', dose: ' 400 IU ' } }, ''],
      [{ kind: 'medication', value: { name: 'Parol', dose: ' ' } }, ''],
      [{ kind: 'healthNote', value: {} }, '  coughing at night  '],
    ];
    const events: TrackerEvent[] = [];
    inputs.forEach(([input, note], i) => {
      for (const draft of buildDrafts(input, ['b1'], T + i * MINUTE, note)) {
        const stored = event(draft, `e${i}`);
        events.push(stored);
        // The edit sheet's mapping must round-trip too.
        events.push(event(inputToDraft(eventToInput(stored, ',')), `edit${i}`));
      }
    });
    const { backup, skipped } = ok(parseBackup(file({ events }), NOW));
    expect(skipped).toEqual([]);
    expect(backup.events).toEqual(events);
  });
});

describe('warnings', () => {
  it('keeps rows from before 2000 or more than a day ahead, and counts them', () => {
    const old = sleep('old', {
      startAt: new Date(1999, 11, 31).getTime(),
      endAt: new Date(1999, 11, 31, 1).getTime(),
    });
    const ahead = event(
      { type: 'diaper', babyId: 'b1', startAt: NOW + 2 * DAY, wet: true, dirty: false },
      'ahead',
    );
    const { backup, warnings } = ok(
      parseBackup(file({ events: [old, ahead, sleep('fine')] }), NOW),
    );
    expect(backup.events).toHaveLength(3);
    expect(warnings).toEqual({ outOfRange: 2, settings: false, badBirthDate: 0 });
  });

  it('falls back field by field when the settings are unreadable', () => {
    const result = ok(parseBackup(file({ settings: { locale: 'de', nightMode: true } }), NOW));
    expect(result.backup.settings).toEqual({ nightMode: true });
    expect(result.warnings.settings).toBe(true);
    const missing = ok(parseBackup(file({ settings: null }), NOW));
    expect(missing.backup.settings).toEqual({});
    expect(missing.warnings.settings).toBe(true);
  });

  it('an unreadable app version becomes empty', () => {
    expect(ok(parseBackup(file({ appVersion: 'x'.repeat(41) }), NOW)).backup.appVersion).toBe('');
  });

  it('drops an unparseable birth date but keeps the baby and its events, and counts a warning', () => {
    // A 6-digit year: nothing in the app writes this, but some browsers' <input type="date"> accept it.
    const result = ok(
      parseBackup(
        file({ babies: [{ ...baby(), birthDate: '20266-01-01' }], events: [sleep()] }),
        NOW,
      ),
    );
    expect(result.skipped).toEqual([]);
    expect(result.backup.babies).toEqual([baby()]);
    expect(result.backup.events).toHaveLength(1);
    expect(result.warnings.badBirthDate).toBe(1);
  });

  it('counts a bad birth date only for a baby that is kept', () => {
    const broken = { ...baby('b2'), birthDate: '20266-01-01', archived: 'yes' }; // skipped: bad-baby
    const duplicate = { ...baby(), birthDate: '20266-01-01' }; // skipped: duplicate-id
    const result = ok(parseBackup(file({ babies: [baby(), broken, duplicate] }), NOW));
    expect(result.skipped.map((row) => row.code)).toEqual(['bad-baby', 'duplicate-id']);
    expect(result.warnings.badBirthDate).toBe(0);
  });
});

describe('checkFileSize', () => {
  it('allows up to 20 MB', () => {
    expect(checkFileSize(MAX_BACKUP_BYTES)).toBe('ok');
    expect(checkFileSize(MAX_BACKUP_BYTES + 1)).toBe('too-large');
  });
});
