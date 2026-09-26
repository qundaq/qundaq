import { isTimedType } from '../domain/rules';
import type { Baby, EventType, TrackerEvent } from '../domain/types';
import type { Locale } from '../i18n';
import { localDate, localTime } from './format';

/** Turkish spreadsheets use the comma as the decimal separator, so their list separator is ";". */
export type CsvSeparator = ';' | ',';

export function csvSeparatorFor(locale: Locale): CsvSeparator {
  return locale === 'tr' ? ';' : ',';
}

/** RFC 4180: a field holding the separator, a quote, CR or LF is quoted, with inner quotes doubled. */
export function quoteCell(value: string, separator: CsvSeparator): string {
  return value.includes(separator) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** A text cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a leading apostrophe. */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** UTF-8 with a byte order mark (so Excel shows ş, ğ, ı), CRLF line ends, a CRLF after the last row too. */
export function toCsv(rows: readonly (readonly string[])[], separator: CsvSeparator): string {
  return `\uFEFF${rows.map((row) => row.map((cell) => quoteCell(cell, separator)).join(separator)).join('\r\n')}\r\n`;
}

export interface CsvText {
  /** Tarih, Başlangıç, Bitiş tarihi, Bitiş saati, Süre (dk), Tür, Ayrıntı, Not: in the app's language. */
  headers: readonly string[];
  typeLabel: (type: EventType) => string;
  /** The Günlük detail line. */
  describe: (event: TrackerEvent) => string;
}

/**
 * Whole minutes of a finished timer. A breastfeed counts its sides only, pauses left out, as Özet's
 * breastfeeding time and the detail text ("Sol 10 dk · Sağ 10 dk") do; a sleep counts its whole length.
 */
function durationMinutes(event: TrackerEvent, end: number): number {
  if (event.type === 'breastfeed' && Array.isArray(event.segments)) {
    let ms = 0;
    for (const segment of event.segments) {
      if (typeof segment.end === 'number' && typeof segment.start === 'number') ms += segment.end - segment.start;
    }
    return Math.round(ms / 60_000);
  }
  return Math.round((end - event.startAt) / 60_000);
}

/** The header and one row per live entry, oldest first. Only the text cells (type, detail, note) are guarded. */
export function eventsToCsvRows(events: readonly TrackerEvent[], text: CsvText): string[][] {
  const rows = events
    .filter((event) => event.deletedAt === undefined)
    .sort((a, b) => a.startAt - b.startAt)
    .map((event) => {
      const end = isTimedType(event.type) ? event.endAt : undefined;
      let detail = '';
      try {
        detail = text.describe(event);
      } catch {
        // A malformed row still gets its date, time and type.
      }
      return [
        localDate(event.startAt),
        localTime(event.startAt),
        end === undefined ? '' : localDate(end),
        end === undefined ? '' : localTime(end),
        end === undefined ? '' : String(durationMinutes(event, end)),
        guardFormula(text.typeLabel(event.type)),
        guardFormula(detail),
        // A malformed row's note that is not text is left empty rather than failing the whole file.
        guardFormula(typeof event.note === 'string' ? event.note : ''),
      ];
    });
  return [[...text.headers], ...rows];
}

const FILE_NAME_MAX = 40;

/** Characters that no file system takes (`/ \ : * ? " < > |` and control characters) become "-". */
export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '-').trim().slice(0, FILE_NAME_MAX).trim();
}

/** The second "ada" (case ignored, as on iOS) becomes "ada-2", the third "ada-3". */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name}-${n}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export interface CsvFile {
  name: string;
  text: string;
}

export interface CsvInput {
  babies: readonly Baby[];
  events: readonly TrackerEvent[];
  /** The export time: the date in the file names. */
  now: number;
  separator: CsvSeparator;
  /** File label for the pumping entries, which belong to no baby ("Sağım"). */
  pumpLabel: string;
  /** Used when a baby's name has no letter or digit left once cleaned ("bebek"). */
  fallbackLabel: string;
  text: CsvText;
}

/**
 * One file per live baby that has entries, plus one for pumping when there are pumps. Deleted entries and
 * the entries of deleted or archived babies are left out.
 */
export function buildCsvFiles(input: CsvInput): CsvFile[] {
  const live = input.events.filter((event) => event.deletedAt === undefined);
  const groups: { label: string; events: TrackerEvent[] }[] = [];
  for (const baby of input.babies) {
    if (baby.deletedAt !== undefined || baby.archived) continue;
    const events = live.filter((event) => event.babyId === baby.id);
    // A malformed device row whose name is not text gets the fallback label, like a name with nothing usable.
    const label = typeof baby.name === 'string' ? sanitizeFileName(baby.name) : '';
    if (events.length > 0) groups.push({ label: /[\p{L}\p{N}]/u.test(label) ? label : input.fallbackLabel, events });
  }
  const pumps = live.filter((event) => event.babyId === null && event.type === 'pump');
  if (pumps.length > 0) groups.push({ label: sanitizeFileName(input.pumpLabel), events: pumps });
  const labels = uniqueNames(groups.map((group) => group.label));
  const date = localDate(input.now);
  return groups.map((group, i) => ({
    name: `qundaq-${labels[i]}-${date}.csv`,
    text: toCsv(eventsToCsvRows(group.events, input.text), input.separator),
  }));
}
