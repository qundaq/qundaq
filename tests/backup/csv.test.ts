import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildCsvFiles,
  csvSeparatorFor,
  eventsToCsvRows,
  guardFormula,
  quoteCell,
  sanitizeFileName,
  toCsv,
  uniqueNames,
  type CsvInput,
  type CsvText,
} from '../../src/backup/csv';
import { MINUTE } from '../../src/domain/time';
import type { Baby, EventDraft, TrackerEvent } from '../../src/domain/types';

let previousTz: string | undefined;
beforeEach(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
});
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();
const event = (id: string, draft: EventDraft, extra: Partial<TrackerEvent> = {}): TrackerEvent =>
  ({ ...draft, id, createdAt: 0, updatedAt: 0, ...extra }) as TrackerEvent;
const baby = (id: string, name: string, extra: Partial<Baby> = {}): Baby => ({ id, name, color: '#7cb7ff', archived: false, createdAt: 0, updatedAt: 0, ...extra });
const TEXT: CsvText = {
  headers: ['Tarih', 'Başlangıç', 'Bitiş tarihi', 'Bitiş saati', 'Süre (dk)', 'Tür', 'Ayrıntı', 'Not'],
  typeLabel: (type) => ({ sleep: 'Uyku', breastfeed: 'Emzirme', diaper: 'Bez', pump: 'Sağım' })[type as string] ?? type,
  describe: (e) => (e.type === 'diaper' ? 'Islak' : ''),
};

describe('cells and files', () => {
  it('uses ";" for Turkish and "," for English', () => {
    expect(csvSeparatorFor('tr')).toBe(';');
    expect(csvSeparatorFor('en')).toBe(',');
  });

  it('quotes a cell holding the separator, a quote or a line break, doubling inner quotes', () => {
    expect(quoteCell('plain', ';')).toBe('plain');
    expect(quoteCell('a;b', ';')).toBe('"a;b"');
    expect(quoteCell('a,b', ';')).toBe('a,b');
    expect(quoteCell('a,b', ',')).toBe('"a,b"');
    expect(quoteCell('say "hi"', ';')).toBe('"say ""hi"""');
    expect(quoteCell('two\nlines', ';')).toBe('"two\nlines"');
    expect(quoteCell('cr\r', ';')).toBe('"cr\r"');
  });

  it('keeps a spreadsheet from running a text cell as a formula', () => {
    for (const text of ['=SUM(A1)', '+90', '-5', '@cmd', '\tx', '\rx']) expect(guardFormula(text)).toBe(`'${text}`);
    expect(guardFormula('Islak')).toBe('Islak');
    expect(guardFormula('')).toBe('');
  });

  it('writes a BOM, CRLF line ends and a final CRLF', () => {
    expect(toCsv([['a', 'b'], ['c;d', 'e']], ';')).toBe('\uFEFFa;b\r\n"c;d";e\r\n');
  });
});

describe('eventsToCsvRows', () => {
  it('lists live entries oldest first with date, times, minutes, type, detail and note', () => {
    const rows = eventsToCsvRows(
      [
        event('d', { type: 'diaper', babyId: 'a', startAt: at(26, 9, 5), wet: true, dirty: false, note: '=kontrol' }),
        event('s', { type: 'sleep', babyId: 'a', startAt: at(25, 22, 10), endAt: at(26, 6, 40) }),
        event('gone', { type: 'sleep', babyId: 'a', startAt: at(25, 1) }, { deletedAt: 1 }),
      ],
      TEXT,
    );
    expect(rows).toEqual([
      TEXT.headers,
      ['2026-09-25', '22:10', '2026-09-26', '06:40', '510', 'Uyku', '', ''],
      ['2026-09-26', '09:05', '', '', '', 'Bez', 'Islak', "'=kontrol"],
    ]);
  });

  it('a running timer has no end and no minutes; a breastfeed counts its sides, without the pause', () => {
    const start = at(26, 8);
    const rows = eventsToCsvRows(
      [
        event('run', { type: 'sleep', babyId: 'a', startAt: start }),
        event('feed', {
          type: 'breastfeed',
          babyId: 'a',
          startAt: start,
          endAt: start + 25 * MINUTE,
          segments: [
            { side: 'L', start, end: start + 10 * MINUTE },
            { side: 'R', start: start + 15 * MINUTE, end: start + 25 * MINUTE },
          ],
        }),
      ],
      TEXT,
    );
    expect(rows[1]).toEqual(['2026-09-26', '08:00', '', '', '', 'Uyku', '', '']);
    expect(rows[2]!.slice(2, 5)).toEqual(['2026-09-26', '08:25', '20']);
  });

  it('a row whose detail cannot be described still gets a line', () => {
    const broken: CsvText = { ...TEXT, describe: () => { throw new TypeError('bad row'); } };
    expect(eventsToCsvRows([event('x', { type: 'sleep', babyId: 'a', startAt: at(26, 8) })], broken)[1]).toEqual([
      '2026-09-26', '08:00', '', '', '', 'Uyku', '', '',
    ]);
  });

  it('a malformed note (not text) is left empty instead of breaking the file', () => {
    const odd = event('x', { type: 'diaper', babyId: 'a', startAt: at(26, 8), wet: true, dirty: false }, { note: 42 as unknown as string });
    const rows = eventsToCsvRows([odd], TEXT);
    expect(rows[1]).toEqual(['2026-09-26', '08:00', '', '', '', 'Bez', 'Islak', '']);
    expect(() => toCsv(rows, ';')).not.toThrow();
  });
});

describe('file names', () => {
  it('replaces characters no file system takes, trims, and stops at 40 characters', () => {
    expect(sanitizeFileName(' Ada/Nur: "1" ')).toBe('Ada-Nur- -1-');
    expect(sanitizeFileName('a\u0000b|c')).toBe('a-b-c');
    expect(sanitizeFileName('x'.repeat(50))).toHaveLength(40);
  });

  it('numbers names that are the same when case is ignored', () => {
    expect(uniqueNames(['Ada', 'ada', 'Can', 'ADA'])).toEqual(['Ada', 'ada-2', 'Can', 'ADA-3']);
  });
});

describe('buildCsvFiles', () => {
  const input = (parts: Partial<CsvInput>): CsvInput => ({
    babies: [],
    events: [],
    now: at(26, 12),
    separator: ';',
    pumpLabel: 'Sağım',
    fallbackLabel: 'bebek',
    text: TEXT,
    ...parts,
  });

  it('one file per live baby with entries, plus pumping; nothing for the others', () => {
    const files = buildCsvFiles(
      input({
        babies: [baby('a', 'Ada'), baby('b', 'Ada'), baby('c', 'Can'), baby('d', 'Deleted', { deletedAt: 1 }), baby('e', 'Old', { archived: true })],
        events: [
          event('1', { type: 'diaper', babyId: 'a', startAt: at(26, 9), wet: true, dirty: false }),
          event('2', { type: 'diaper', babyId: 'b', startAt: at(26, 9), wet: true, dirty: false }),
          event('3', { type: 'diaper', babyId: 'd', startAt: at(26, 9), wet: true, dirty: false }),
          event('4', { type: 'diaper', babyId: 'e', startAt: at(26, 9), wet: true, dirty: false }),
          event('5', { type: 'pump', babyId: null, startAt: at(26, 7), mlLeft: 60 }),
          event('6', { type: 'diaper', babyId: 'c', startAt: at(26, 9), wet: true, dirty: false }, { deletedAt: 1 }),
        ],
      }),
    );
    expect(files.map((file) => file.name)).toEqual(['qundaq-Ada-2026-09-26.csv', 'qundaq-Ada-2-2026-09-26.csv', 'qundaq-Sağım-2026-09-26.csv']);
    expect(files[0]!.text).toBe('\uFEFFTarih;Başlangıç;Bitiş tarihi;Bitiş saati;Süre (dk);Tür;Ayrıntı;Not\r\n2026-09-26;09:00;;;;Bez;Islak;\r\n');
  });

  it('a name with nothing usable left gets the fallback label', () => {
    const files = buildCsvFiles(input({ babies: [baby('a', '///')], events: [event('1', { type: 'sleep', babyId: 'a', startAt: at(26, 1) })] }));
    expect(files.map((file) => file.name)).toEqual(['qundaq-bebek-2026-09-26.csv']);
  });

  it('a malformed baby whose name is not text gets the fallback label instead of breaking the export', () => {
    const odd = { ...baby('a', 'x'), name: 42 } as unknown as Baby;
    const files = buildCsvFiles(input({ babies: [odd], events: [event('1', { type: 'sleep', babyId: 'a', startAt: at(26, 1) })] }));
    expect(files.map((file) => file.name)).toEqual(['qundaq-bebek-2026-09-26.csv']);
  });
});
