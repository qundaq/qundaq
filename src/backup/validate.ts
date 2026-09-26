import { fromDateInputValue } from '../domain/days';
import { scaleToInt } from '../domain/decimal';
import { BABY_NAME_MAX, GROWTH_RANGES, MAX_BOTTLE_ML, MAX_PUMP_ML, MIX_NAME_MAX, TEMPERATURE_RANGE_C, TEXT_LIMITS } from '../domain/rules';
import { MAX_LAYERS } from '../domain/sounds';
import { STOOL_COLORS } from '../domain/stool';
import { DAY } from '../domain/time';
import type { Baby, BottleContents, BreastSegment, Consistency, EventPayload, EventType, Id, Mix, MixLayer, TrackerEvent } from '../domain/types';
import { LOCALES, type Locale } from '../i18n';
import { BACKUP_APP, BACKUP_VERSION } from './format';
import { migrateBackup, type RawBackup } from './migrate';

/** Files above this are refused before reading: parsing much more could get the app killed on an older iPhone. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function checkFileSize(bytes: number): 'ok' | 'too-large' {
  return bytes <= MAX_BACKUP_BYTES ? 'ok' : 'too-large';
}

/** Why a row was skipped. The UI has a sentence for each (`backup.problem.<code>`). */
export type ProblemCode =
  | 'not-object' // the row is not an object
  | 'bad-id' // missing id, or not a string of 1–64 characters
  | 'duplicate-id' // an earlier row in the file has the same id
  | 'bad-time' // startAt/endAt/createdAt/updatedAt/deletedAt not a number, or the end before the start
  | 'bad-baby' // name, color or archived flag of a baby (birth date is dropped with a warning instead, never fatal)
  | 'unknown-type' // an event type this version does not know
  | 'bad-payload' // the fields of the event's type (sides, amount, measurements…)
  | 'bad-field' // group, note, or a pump that names a baby
  | 'missing-baby' // an event whose baby is not in the file, or was skipped
  | 'bad-mix'; // a saved mix's name or layers

export const PROBLEM_CODES: readonly ProblemCode[] = [
  'not-object',
  'bad-id',
  'duplicate-id',
  'bad-time',
  'bad-baby',
  'unknown-type',
  'bad-payload',
  'bad-field',
  'missing-baby',
  'bad-mix',
];

/** A skipped row, with whatever could be read of it, so the preview can name it by date, time and type. */
export interface SkippedRow {
  list: 'babies' | 'events' | 'mixes';
  index: number;
  code: ProblemCode;
  type?: EventType;
  startAt?: number;
  name?: string;
}

export interface BackupWarnings {
  /** Events kept although a time lies before 2000 or more than a day ahead (a wrong clock or year wheel). */
  outOfRange: number;
  /** At least one setting was unreadable; the device's own value is kept for it. */
  settings: boolean;
  /** Babies kept without their birth date because it did not parse (the baby and its events survive). */
  badBirthDate: number;
}

/** Invalid settings fields are absent: the device keeps its own value for them. */
export interface ParsedSettings {
  locale?: Locale;
  nightMode?: boolean;
  lastBabyIds: Id[];
}

export interface ParsedBackup {
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  babies: Baby[];
  events: TrackerEvent[];
  mixes: Mix[];
  settings: ParsedSettings;
}

/** not-backup: not JSON, not a Qundaq file, or its structure is broken. newer-version: made by a newer app. */
export type FatalCode = 'not-backup' | 'newer-version';

export type ParseResult =
  | { ok: true; backup: ParsedBackup; skipped: SkippedRow[]; warnings: BackupWarnings }
  | { ok: false; error: FatalCode };

const MAX_ID_LENGTH = 64;
const MAX_APP_VERSION_LENGTH = 40;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const BOTTLE_CONTENTS: readonly BottleContents[] = ['breastmilk', 'formula', 'mixed'];
const CONSISTENCIES: readonly Consistency[] = ['watery', 'soft', 'formed', 'hard'];
const STOOL_COLOR_IDS: readonly string[] = STOOL_COLORS.map((color) => color.id);

class RowProblem extends Error {
  constructor(readonly code: ProblemCode) {
    super(code);
  }
}

function fail(code: ProblemCode): never {
  throw new RowProblem(code);
}

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the row's own fields: never anything inherited, such as a `__proto__` or `constructor`. */
function own(row: Row, key: string): unknown {
  return Object.hasOwn(row, key) ? row[key] : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A time within years 0–9999, well inside the ECMAScript time value range (±8.64e15). The full range is
 * too generous: a value near its edge still formats today but throws once a day is added to it (the
 * out-of-range check) or it is shown with Intl, so it would slip through as "fine" and break later. The
 * app itself only ever writes years within this range.
 */
const MAX_TIME = 253402300799999; // 9999-12-31T23:59:59.999Z
const MIN_TIME = -62167219200000; // 0000-01-01T00:00:00.000Z

function isTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= MIN_TIME && value <= MAX_TIME;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isId(value: unknown): value is Id {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function readId(row: Row): Id {
  const id = own(row, 'id');
  return isId(id) ? id : fail('bad-id');
}

/** createdAt, updatedAt and an optional deletedAt. */
function readBookkeeping(row: Row): { createdAt: number; updatedAt: number; deletedAt?: number } {
  const createdAt = own(row, 'createdAt');
  const updatedAt = own(row, 'updatedAt');
  const deletedAt = own(row, 'deletedAt');
  if (!isTime(createdAt) || !isTime(updatedAt)) fail('bad-time');
  if (deletedAt !== undefined && !isTime(deletedAt)) fail('bad-time');
  return { createdAt, updatedAt, ...(deletedAt === undefined ? {} : { deletedAt }) };
}

/**
 * A malformed `birthDate` (an out-of-range or otherwise unparseable date; nothing in the app stops one
 * being typed, e.g. some browsers' date input accepts a 6-digit year) does not sink the whole baby: it is
 * dropped and counted as a warning, so the baby and its events survive.
 */
function readBaby(raw: unknown, warnBirthDate: () => void): Baby {
  if (!isRecord(raw)) fail('not-object');
  const id = readId(raw);
  const name = own(raw, 'name');
  const color = own(raw, 'color');
  const rawBirthDate = own(raw, 'birthDate');
  const archived = own(raw, 'archived');
  if (typeof name !== 'string' || name.trim() === '' || name.length > BABY_NAME_MAX) fail('bad-baby');
  if (typeof color !== 'string' || !COLOR.test(color)) fail('bad-baby');
  let birthDate: string | undefined;
  if (rawBirthDate !== undefined) {
    if (typeof rawBirthDate === 'string' && fromDateInputValue(rawBirthDate) !== null) birthDate = rawBirthDate;
    else warnBirthDate();
  }
  if (typeof archived !== 'boolean') fail('bad-baby');
  return { id, name, color, ...(birthDate === undefined ? {} : { birthDate }), archived, ...readBookkeeping(raw) };
}

/** A note is kept byte for byte; only a whitespace-only one, which the app never stores, is dropped. */
function readNote(row: Row): string | undefined {
  const note = own(row, 'note');
  if (note === undefined) return undefined;
  if (typeof note !== 'string' || note.length > TEXT_LIMITS.note) fail('bad-field');
  return note.trim() === '' ? undefined : note;
}

function readSegments(row: Row, endAt: number | undefined): BreastSegment[] {
  const raw = own(row, 'segments');
  if (!Array.isArray(raw) || raw.length === 0) fail('bad-payload');
  const segments: BreastSegment[] = [];
  for (const [i, item] of raw.entries()) {
    if (!isRecord(item)) fail('bad-payload');
    const side = own(item, 'side');
    const start = own(item, 'start');
    const end = own(item, 'end');
    if ((side !== 'L' && side !== 'R') || !isTime(start)) fail('bad-payload');
    if (end !== undefined && (!isTime(end) || end < start)) fail('bad-payload');
    const isLast = i === raw.length - 1;
    if (end === undefined && (!isLast || endAt !== undefined)) fail('bad-payload'); // only a running last side is open
    const previous = segments.at(-1);
    if (previous && start < previous.end!) fail('bad-payload'); // in order, never overlapping
    segments.push({ side, start, ...(end === undefined ? {} : { end }) });
  }
  return segments;
}

function optionalInt(row: Row, key: string, min: number, max: number): number | undefined {
  const value = own(row, key);
  if (value === undefined) return undefined;
  return isIntIn(value, min, max) ? value : fail('bad-payload');
}

type Payload = Omit<EventPayload, 'type'> | Record<string, never>;

/** One reader per event type; a Record over EventType, so a new type cannot be forgotten here. */
const PAYLOADS: { [K in EventType]: (row: Row, endAt: number | undefined, note: string | undefined) => Payload } = {
  sleep: () => ({}),
  breastfeed: (row, endAt) => ({ segments: readSegments(row, endAt) }),
  bottle: (row) => {
    const ml = own(row, 'ml');
    const contents = own(row, 'contents');
    if (!isIntIn(ml, 1, MAX_BOTTLE_ML) || !BOTTLE_CONTENTS.includes(contents as BottleContents)) fail('bad-payload');
    return { ml, contents: contents as BottleContents };
  },
  diaper: (row) => {
    const wet = own(row, 'wet');
    const dirty = own(row, 'dirty');
    const stoolColor = own(row, 'stoolColor');
    const consistency = own(row, 'consistency');
    if (typeof wet !== 'boolean' || typeof dirty !== 'boolean') fail('bad-payload');
    if (stoolColor !== undefined && !STOOL_COLOR_IDS.includes(stoolColor as string)) fail('bad-payload');
    if (consistency !== undefined && !CONSISTENCIES.includes(consistency as Consistency)) fail('bad-payload');
    return {
      wet,
      dirty,
      ...(stoolColor === undefined ? {} : { stoolColor }),
      ...(consistency === undefined ? {} : { consistency }),
    } as Payload;
  },
  pump: (row) => {
    const mlLeft = optionalInt(row, 'mlLeft', 1, MAX_PUMP_ML);
    const mlRight = optionalInt(row, 'mlRight', 1, MAX_PUMP_ML);
    if (mlLeft === undefined && mlRight === undefined) fail('bad-payload');
    return { ...(mlLeft === undefined ? {} : { mlLeft }), ...(mlRight === undefined ? {} : { mlRight }) };
  },
  growth: (row) => {
    const payload: Record<string, number> = {};
    for (const metric of ['weightG', 'heightMm', 'headMm'] as const) {
      const [min, max] = GROWTH_RANGES[metric];
      const value = optionalInt(row, metric, min, max);
      if (value !== undefined) payload[metric] = value;
    }
    if (Object.keys(payload).length === 0) fail('bad-payload');
    return payload;
  },
  temperature: (row) => {
    const raw = own(row, 'celsius');
    if (!isFiniteNumber(raw)) fail('bad-payload');
    // The same rounding as the sheet, so every value the app wrote maps to itself.
    const celsius = scaleToInt(raw, 10) / 10;
    const [min, max] = TEMPERATURE_RANGE_C;
    if (celsius < min || celsius > max) fail('bad-payload');
    return { celsius };
  },
  medication: (row) => {
    const rawName = own(row, 'name');
    const rawDose = own(row, 'dose');
    if (typeof rawName !== 'string' || (rawDose !== undefined && typeof rawDose !== 'string')) fail('bad-payload');
    const name = rawName.trim();
    const dose = rawDose?.trim() ?? '';
    if (name === '' || name.length > TEXT_LIMITS.medicationName || dose.length > TEXT_LIMITS.dose) fail('bad-payload');
    return { name, ...(dose === '' ? {} : { dose }) };
  },
  healthNote: (_row, _endAt, note) => (note === undefined ? fail('bad-payload') : {}),
};

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && Object.hasOwn(PAYLOADS, value);
}

function readEvent(raw: unknown, babyIds: ReadonlySet<Id>): TrackerEvent {
  if (!isRecord(raw)) fail('not-object');
  const id = readId(raw);
  const type = own(raw, 'type');
  if (!isEventType(type)) fail('unknown-type');
  const babyId = own(raw, 'babyId');
  if (type === 'pump') {
    if (babyId !== null) fail('bad-field');
  } else if (typeof babyId !== 'string' || !babyIds.has(babyId)) {
    fail('missing-baby');
  }
  const startAt = own(raw, 'startAt');
  const endAt = own(raw, 'endAt');
  if (!isTime(startAt)) fail('bad-time');
  if (endAt !== undefined && (!isTime(endAt) || endAt < startAt)) fail('bad-time');
  const groupId = own(raw, 'groupId');
  if (groupId !== undefined && !isId(groupId)) fail('bad-field');
  const note = readNote(raw);
  const bookkeeping = readBookkeeping(raw);
  const payload = PAYLOADS[type](raw, endAt, note);
  return {
    id,
    type,
    babyId,
    ...(groupId === undefined ? {} : { groupId }),
    startAt,
    ...(endAt === undefined ? {} : { endAt }),
    ...payload,
    ...(note === undefined ? {} : { note }),
    ...bookkeeping,
  } as TrackerEvent;
}

/**
 * A saved mix: a name of 1–40 characters (trimmed) and 1–MAX_LAYERS layers, each a sound id of 1–40
 * characters (ids this version does not know are kept: they come from a newer version and are skipped
 * only when played) with a finite gain in 0..1, no sound twice.
 */
function readMix(raw: unknown): Mix {
  if (!isRecord(raw)) fail('not-object');
  const id = readId(raw);
  const name = own(raw, 'name');
  const rawLayers = own(raw, 'layers');
  if (typeof name !== 'string' || name.trim() === '' || name.length > MIX_NAME_MAX) fail('bad-mix');
  if (!Array.isArray(rawLayers) || rawLayers.length === 0 || rawLayers.length > MAX_LAYERS) fail('bad-mix');
  const layers: MixLayer[] = [];
  for (const item of rawLayers) {
    if (!isRecord(item)) fail('bad-mix');
    const soundId = own(item, 'soundId');
    const gain = own(item, 'gain');
    if (typeof soundId !== 'string' || soundId.length === 0 || soundId.length > 40) fail('bad-mix');
    if (!isFiniteNumber(gain) || gain < 0 || gain > 1) fail('bad-mix');
    if (layers.some((layer) => layer.soundId === soundId)) fail('bad-mix');
    layers.push({ soundId, gain });
  }
  return { id, name, layers, ...readBookkeeping(raw) };
}

/**
 * What could be read of a skipped row, for the preview. `name` is only read for a baby or a mix row: an
 * event's own `name` field (a medicine) is not a baby name, and must never be reported as if it were one.
 */
function describeSkipped(raw: unknown, list: SkippedRow['list']): Pick<SkippedRow, 'type' | 'startAt' | 'name'> {
  if (!isRecord(raw)) return {};
  if (list === 'babies' || list === 'mixes') {
    const name = own(raw, 'name');
    return typeof name === 'string' ? { name: name.slice(0, list === 'babies' ? BABY_NAME_MAX : MIX_NAME_MAX) } : {};
  }
  const type = own(raw, 'type');
  const startAt = own(raw, 'startAt');
  return {
    ...(isEventType(type) ? { type } : {}),
    ...(isTime(startAt) ? { startAt } : {}),
  };
}

function problemOf(error: unknown): ProblemCode {
  if (error instanceof RowProblem) return error.code;
  throw error;
}

/**
 * Reads a list, skipping rows that fail their checks and later duplicates of an id.
 *
 * An id is only "seen" once its row has actually passed every other check: if the earlier row sharing an
 * id was itself broken (bad time, unknown type, …), it never claims the id, so a later, otherwise good
 * row with that id is kept rather than also being skipped as a duplicate. Only two rows that are each
 * individually readable, and share an id, produce a 'duplicate-id' (the later one skipped).
 */
function readRows<T extends { id: Id }>(
  list: SkippedRow['list'],
  raw: readonly unknown[],
  read: (row: unknown) => T,
  skipped: SkippedRow[],
): T[] {
  const rows: T[] = [];
  const seen = new Set<Id>();
  raw.forEach((item, index) => {
    try {
      const row = read(item);
      if (seen.has(row.id)) fail('duplicate-id');
      seen.add(row.id);
      rows.push(row);
    } catch (error) {
      skipped.push({ list, index, code: problemOf(error), ...describeSkipped(item, list) });
    }
  });
  return rows;
}

function readSettings(raw: unknown, babyIds: ReadonlySet<Id>): { settings: ParsedSettings; ok: boolean } {
  if (!isRecord(raw)) return { settings: { lastBabyIds: [] }, ok: false };
  const locale = own(raw, 'locale');
  const nightMode = own(raw, 'nightMode');
  const lastBabyIds = own(raw, 'lastBabyIds');
  const localeOk = LOCALES.includes(locale as Locale);
  const nightOk = typeof nightMode === 'boolean';
  const idsOk = Array.isArray(lastBabyIds);
  return {
    settings: {
      ...(localeOk ? { locale: locale as Locale } : {}),
      ...(nightOk ? { nightMode } : {}),
      // Ids of babies that are not in the file are dropped silently: they only preselect chips.
      lastBabyIds: idsOk ? lastBabyIds.filter((id): id is Id => typeof id === 'string' && babyIds.has(id)) : [],
    },
    ok: localeOk && nightOk && idsOk,
  };
}

/** 2000-01-01 local time: anything earlier is a wrong spin of the year wheel. */
const EARLIEST_BELIEVABLE = () => new Date(2000, 0, 1).getTime();

function outOfRange(event: TrackerEvent, now: number): boolean {
  const earliest = EARLIEST_BELIEVABLE();
  const latest = now + DAY;
  return [event.startAt, event.endAt].some((time) => time !== undefined && (time < earliest || time > latest));
}

/**
 * Reads a backup file strictly. Fatal problems refuse the whole file. A row that fails its checks is
 * skipped (never repaired by guessing) and reported. New objects are built from the known fields only,
 * so unknown fields (and `__proto__`/`constructor` keys) never reach the database. Only values the app
 * never writes are normalised: a whitespace-only note is dropped, a medicine's name and dose trimmed,
 * a temperature rounded to 0.1 °C.
 */
export function parseBackup(text: string, now: number): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
  } catch {
    return { ok: false, error: 'not-backup' };
  }
  if (!isRecord(parsed) || own(parsed, 'app') !== BACKUP_APP) return { ok: false, error: 'not-backup' };
  const version = own(parsed, 'schemaVersion');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'not-backup' };
  if (version > BACKUP_VERSION) return { ok: false, error: 'newer-version' };

  let raw: RawBackup;
  try {
    raw = migrateBackup(parsed, version);
  } catch {
    return { ok: false, error: 'not-backup' };
  }
  const exportedAt = own(raw, 'exportedAt');
  const babies = own(raw, 'babies');
  const events = own(raw, 'events');
  const mixes = own(raw, 'mixes');
  if (!isTime(exportedAt) || !Array.isArray(babies) || !Array.isArray(events) || !Array.isArray(mixes)) {
    return { ok: false, error: 'not-backup' };
  }
  const appVersion = own(raw, 'appVersion');

  const skipped: SkippedRow[] = [];
  // Babies read without their birth date; counted only once the baby is kept (not skipped for another
  // problem, nor as a later duplicate).
  const withoutBirthDate = new Set<Baby>();
  const goodBabies = readRows(
    'babies',
    babies,
    (row) => {
      let dropped = false;
      const baby = readBaby(row, () => {
        dropped = true;
      });
      if (dropped) withoutBirthDate.add(baby);
      return baby;
    },
    skipped,
  );
  const badBirthDate = goodBabies.filter((baby) => withoutBirthDate.has(baby)).length;
  const babyIds = new Set(goodBabies.map((baby) => baby.id));
  const goodEvents = readRows('events', events, (row) => readEvent(row, babyIds), skipped);
  const goodMixes = readRows('mixes', mixes, readMix, skipped);
  const { settings, ok: settingsOk } = readSettings(own(raw, 'settings'), babyIds);

  return {
    ok: true,
    backup: {
      schemaVersion: BACKUP_VERSION,
      exportedAt,
      appVersion: typeof appVersion === 'string' && appVersion.length <= MAX_APP_VERSION_LENGTH ? appVersion : '',
      babies: goodBabies,
      events: goodEvents,
      mixes: goodMixes,
      settings,
    },
    skipped,
    warnings: { outOfRange: goodEvents.filter((event) => outOfRange(event, now)).length, settings: !settingsOk, badBirthDate },
  };
}
