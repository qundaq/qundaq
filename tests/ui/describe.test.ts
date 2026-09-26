import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';
import {
  dayLabel,
  describeEvent,
  firstLine,
  formatMeasurement,
  hasAlert,
  timeRange,
} from '../../src/ui/history/describe';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const dayStart = (day: number) => new Date(2026, 8, day).getTime();
const NOW = at(25, 12);
const ev = (draft: EventDraft): TrackerEvent => ({ ...draft, id: 'e', createdAt: 0, updatedAt: 0 });

describe('describeEvent', () => {
  it('breastfeeding: time per side, or the current side while it runs', () => {
    const start = at(25, 8);
    const finished = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      endAt: start + 20 * MINUTE,
      segments: [
        { side: 'L', start, end: start + 12 * MINUTE },
        { side: 'R', start: start + 12 * MINUTE, end: start + 20 * MINUTE },
      ],
    });
    expect(describeEvent(tr, 'tr', finished, NOW)).toBe('Sol 12 dk · Sağ 8 dk');
    const running = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      segments: [
        { side: 'L', start, end: start + 5 * MINUTE },
        { side: 'R', start: start + 5 * MINUTE },
      ],
    });
    expect(describeEvent(tr, 'tr', running, NOW)).toBe('Sağ · devam ediyor');
  });

  it('rounds a side to whole minutes the way the edit sheet does', () => {
    const start = at(25, 8);
    const feed = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      endAt: start + 7 * MINUTE + 40_000,
      segments: [{ side: 'L', start, end: start + 7 * MINUTE + 40_000 }],
    });
    expect(describeEvent(tr, 'tr', feed, NOW)).toBe('Sol 8 dk');
  });

  it('sleep: its length, a running one up to now', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'sleep', babyId: 'a', startAt: at(25, 9), endAt: at(25, 10, 30) }),
        NOW,
      ),
    ).toBe('1 sa 30 dk');
    expect(
      describeEvent(tr, 'tr', ev({ type: 'sleep', babyId: 'a', startAt: at(25, 11, 15) }), NOW),
    ).toBe('45 dk');
  });

  it('bottle and diaper', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'bottle', babyId: 'a', startAt: NOW, ml: 90, contents: 'breastmilk' }),
        NOW,
      ),
    ).toBe('90 ml · Anne sütü');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({
          type: 'diaper',
          babyId: 'a',
          startAt: NOW,
          wet: true,
          dirty: true,
          stoolColor: 'mustard',
          consistency: 'soft',
        }),
        NOW,
      ),
    ).toBe('Islak + kirli · Hardal · Yumuşak');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }),
        NOW,
      ),
    ).toBe('Islak');
    expect(
      describeEvent(
        en,
        'en',
        ev({ type: 'diaper', babyId: 'a', startAt: NOW, wet: false, dirty: true }),
        NOW,
      ),
    ).toBe('Dirty');
  });

  it('pumping, growth and temperature, with the locale decimal separator', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'pump', babyId: null, startAt: NOW, mlLeft: 60, mlRight: 40 }),
        NOW,
      ),
    ).toBe('Sol 60 ml · Sağ 40 ml');
    const growth = ev({
      type: 'growth',
      babyId: 'a',
      startAt: NOW,
      weightG: 3450,
      heightMm: 525,
      headMm: 350,
    });
    expect(describeEvent(tr, 'tr', growth, NOW)).toBe('3,45 kg · Boy 52,5 cm · Baş 35 cm');
    expect(describeEvent(en, 'en', growth, NOW)).toBe('3.45 kg · Length 52.5 cm · Head 35 cm');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 38.2 }),
        NOW,
      ),
    ).toBe('38,2 °C');
  });

  it('medication and health notes', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'medication', babyId: 'a', startAt: NOW, name: 'D vitamini', dose: '400 IU' }),
        NOW,
      ),
    ).toBe('D vitamini · 400 IU');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'medication', babyId: 'a', startAt: NOW, name: 'Parasetamol' }),
        NOW,
      ),
    ).toBe('Parasetamol');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({
          type: 'healthNote',
          babyId: 'a',
          startAt: NOW,
          note: 'Aşı yapıldı\nKolunda kızarıklık',
        }),
        NOW,
      ),
    ).toBe('Aşı yapıldı');
  });

  it('survives a growth row without measurements', () => {
    expect(describeEvent(tr, 'tr', ev({ type: 'growth', babyId: 'a', startAt: NOW }), NOW)).toBe(
      '',
    );
  });
});

describe('firstLine', () => {
  it('keeps the first line and cuts it at 80 characters', () => {
    expect(firstLine('  Birinci satır \nİkinci')).toBe('Birinci satır');
    const cut = firstLine('x'.repeat(100));
    expect(cut).toHaveLength(80);
    expect(cut.endsWith('…')).toBe(true);
    expect(firstLine('x'.repeat(80))).toBe('x'.repeat(80));
  });
});

describe('timeRange', () => {
  it('an instant entry shows its time', () => {
    expect(
      timeRange(
        tr,
        'tr',
        ev({ type: 'diaper', babyId: 'a', startAt: at(25, 14, 5), wet: true, dirty: false }),
        dayStart(25),
      ),
    ).toBe('14:05');
  });

  it('marks the end that falls on another day than the one shown', () => {
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(24, 22, 10), endAt: at(25, 6, 30) });
    expect(timeRange(tr, 'tr', sleep, dayStart(25))).toBe('22:10 (önceki gün) – 06:30');
    expect(timeRange(tr, 'tr', sleep, dayStart(24))).toBe('22:10 – 06:30 (ertesi gün)');
    const twoDays = ev({
      type: 'sleep',
      babyId: 'a',
      startAt: at(23, 22, 10),
      endAt: at(25, 6, 30),
    });
    expect(timeRange(tr, 'tr', twoDays, dayStart(25))).toMatch(/^22:10 \(23 Eyl\S*\) – 06:30$/);
  });

  it('a running timer', () => {
    expect(
      timeRange(
        tr,
        'tr',
        ev({ type: 'sleep', babyId: 'a', startAt: at(25, 22, 10) }),
        dayStart(25),
      ),
    ).toBe('22:10 – devam ediyor');
  });
});

describe('dayLabel', () => {
  it('today, yesterday, otherwise the weekday and the date', () => {
    expect(dayLabel(tr, 'tr', dayStart(25), NOW)).toBe('Bugün');
    expect(dayLabel(tr, 'tr', dayStart(24), NOW)).toBe('Dün');
    expect(dayLabel(en, 'en', dayStart(24), NOW)).toBe('Yesterday');
    const sunday = dayStart(20);
    expect(dayLabel(tr, 'tr', sunday, NOW)).toBe(
      new Intl.DateTimeFormat('tr', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        sunday,
      ),
    );
    expect(dayLabel(tr, 'tr', sunday, NOW)).toContain('20 Eylül');
  });
});

describe('formatMeasurement and hasAlert', () => {
  it('shows grams as kg and millimetres as cm', () => {
    expect(formatMeasurement('tr', 'weightG', 3100)).toBe('3,1 kg');
    expect(formatMeasurement('tr', 'weightG', 3453)).toBe('3,453 kg'); // stored in whole grams, shown exactly
    expect(formatMeasurement('en', 'heightMm', 525)).toBe('52.5 cm');
  });

  it('flags warning stool colors and fever or low temperatures', () => {
    expect(
      hasAlert(
        ev({
          type: 'diaper',
          babyId: 'a',
          startAt: NOW,
          wet: false,
          dirty: true,
          stoolColor: 'white',
        }),
      ),
    ).toBe(true);
    expect(
      hasAlert(
        ev({
          type: 'diaper',
          babyId: 'a',
          startAt: NOW,
          wet: false,
          dirty: true,
          stoolColor: 'yellow',
        }),
      ),
    ).toBe(false);
    expect(hasAlert(ev({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 38.2 }))).toBe(
      true,
    );
    expect(hasAlert(ev({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 35.5 }))).toBe(
      true,
    );
    expect(hasAlert(ev({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 36.8 }))).toBe(
      false,
    );
  });
});
