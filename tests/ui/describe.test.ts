import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';
import {
  dayLabel,
  describeEvent,
  firstLine,
  formatMeasurement,
  formatNumber,
  hasAlert,
  shortDate,
  clockTime,
  timeRange,
  typeIcon,
} from '../../src/ui/history/describe';
import { formatDuration } from '../../src/ui/shared/format';
import { segmentMinutes } from '../../src/ui/log/edits';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const en = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const dayStart = (day: number) => new Date(2026, 8, day).getTime();
const NOW = at(25, 12);
const ev = (draft: EventDraft): TrackerEvent => ({ ...draft, id: 'e', createdAt: 0, updatedAt: 0 });
const ml = (locale: 'tr' | 'en', t: typeof tr, value: number) =>
  t('unit.ml', { ml: formatNumber(locale, value) });

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
    expect(describeEvent(tr, 'tr', finished, NOW)).toBe(
      `${tr('side.L.button')} ${tr('time.minutes', { m: 12 })} · ${tr('side.R.button')} ${tr('time.minutes', { m: 8 })}`,
    );
    const running = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      segments: [
        { side: 'L', start, end: start + 5 * MINUTE },
        { side: 'R', start: start + 5 * MINUTE },
      ],
    });
    expect(describeEvent(tr, 'tr', running, NOW)).toBe(
      `${tr('side.R.button')} · ${tr('log.ongoing')}`,
    );
  });

  it('rounds a side to whole minutes the way the edit sheet does', () => {
    const start = at(25, 8);
    const durationMs = 7 * MINUTE + 40_000;
    const feed = ev({
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      endAt: start + durationMs,
      segments: [{ side: 'L', start, end: start + durationMs }],
    });
    expect(describeEvent(tr, 'tr', feed, NOW)).toBe(
      `${tr('side.L.button')} ${tr('time.minutes', { m: segmentMinutes(durationMs) })}`,
    );
  });

  it('sleep: its length, a running one up to now', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'sleep', babyId: 'a', startAt: at(25, 9), endAt: at(25, 10, 30) }),
        NOW,
      ),
    ).toBe(formatDuration(tr, 90 * MINUTE));
    expect(
      describeEvent(tr, 'tr', ev({ type: 'sleep', babyId: 'a', startAt: at(25, 11, 15) }), NOW),
    ).toBe(formatDuration(tr, 45 * MINUTE));
  });

  it('bottle and diaper', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'bottle', babyId: 'a', startAt: NOW, ml: 90, contents: 'breastmilk' }),
        NOW,
      ),
    ).toBe(`${ml('tr', tr, 90)} · ${tr('bottle.breastmilk')}`);
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
    ).toBe(
      `${tr('describe.diaper.both')} · ${tr('stool.color.mustard')} · ${tr('consistency.soft')}`,
    );
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'diaper', babyId: 'a', startAt: NOW, wet: true, dirty: false }),
        NOW,
      ),
    ).toBe(tr('diaper.wet.button'));
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
        ev({ type: 'pump', babyId: null, startAt: NOW, endAt: NOW, mlLeft: 60, mlRight: 40 }),
        NOW,
      ),
    ).toBe(
      `${tr('side.L.button')} ${ml('tr', tr, 60)} · ${tr('side.R.button')} ${ml('tr', tr, 40)}`,
    );
    const growth = ev({
      type: 'growth',
      babyId: 'a',
      startAt: NOW,
      weightG: 3450,
      heightMm: 525,
      headMm: 350,
    });
    expect(describeEvent(tr, 'tr', growth, NOW)).toBe(
      [
        formatMeasurement('tr', 'weightG', 3450),
        tr('describe.height', { value: '52,5' }),
        tr('describe.head', { value: '35' }),
      ].join(' · '),
    );
    expect(describeEvent(en, 'en', growth, NOW)).toBe(
      [
        formatMeasurement('en', 'weightG', 3450),
        en('describe.height', { value: '52.5' }),
        en('describe.head', { value: '35' }),
      ].join(' · '),
    );
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'temperature', babyId: 'a', startAt: NOW, celsius: 38.2 }),
        NOW,
      ),
    ).toBe(tr('describe.temperature', { value: '38,2' }));
  });

  it('medication and health notes', () => {
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'medication', babyId: 'a', startAt: NOW, name: 'Vitamin D', dose: '400 IU' }),
        NOW,
      ),
    ).toBe('Vitamin D · 400 IU');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({ type: 'medication', babyId: 'a', startAt: NOW, name: 'Paracetamol' }),
        NOW,
      ),
    ).toBe('Paracetamol');
    expect(
      describeEvent(
        tr,
        'tr',
        ev({
          type: 'healthNote',
          babyId: 'a',
          startAt: NOW,
          note: 'Vaccine given\nRedness on arm',
        }),
        NOW,
      ),
    ).toBe('Vaccine given');
  });

  it('survives a growth row without measurements', () => {
    expect(describeEvent(tr, 'tr', ev({ type: 'growth', babyId: 'a', startAt: NOW }), NOW)).toBe(
      '',
    );
  });
});

describe('firstLine', () => {
  it('keeps the first line and cuts it at 80 characters', () => {
    expect(firstLine('  First line \nSecond')).toBe('First line');
    const cut = firstLine('x'.repeat(100));
    expect(cut).toHaveLength(80);
    expect(cut.endsWith('…')).toBe(true);
    expect(firstLine('x'.repeat(80))).toBe('x'.repeat(80));
  });
});

describe('timeRange', () => {
  it('an instant entry shows its time', () => {
    const when = at(25, 14, 5);
    expect(
      timeRange(
        tr,
        'tr',
        ev({ type: 'diaper', babyId: 'a', startAt: when, wet: true, dirty: false }),
        dayStart(25),
      ),
    ).toBe(clockTime('tr', when));
  });

  it('marks the end that falls on another day than the one shown', () => {
    const start = at(24, 22, 10);
    const end = at(25, 6, 30);
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: start, endAt: end });
    expect(timeRange(tr, 'tr', sleep, dayStart(25))).toBe(
      `${clockTime('tr', start)} ${tr('log.suffix.previousDay')} – ${clockTime('tr', end)}`,
    );
    expect(timeRange(tr, 'tr', sleep, dayStart(24))).toBe(
      `${clockTime('tr', start)} – ${clockTime('tr', end)} ${tr('log.suffix.nextDay')}`,
    );
    const twoDaysStart = at(23, 22, 10);
    const twoDays = ev({
      type: 'sleep',
      babyId: 'a',
      startAt: twoDaysStart,
      endAt: end,
    });
    expect(timeRange(tr, 'tr', twoDays, dayStart(25))).toBe(
      `${clockTime('tr', twoDaysStart)} (${shortDate('tr', twoDaysStart)}) – ${clockTime('tr', end)}`,
    );
  });

  it('a pump: a moment (ml only) shows its time, a timed one its range, a running one runs', () => {
    const start = at(25, 9, 5);
    const end = at(25, 9, 27);
    const pump = (draft: Partial<EventDraft>) =>
      ev({ type: 'pump', babyId: null, startAt: start, ...draft } as EventDraft);
    expect(timeRange(tr, 'tr', pump({ endAt: start, mlLeft: 60 }), dayStart(25))).toBe(
      clockTime('tr', start),
    );
    expect(timeRange(tr, 'tr', pump({ endAt: end, minLeft: 22 }), dayStart(25))).toBe(
      `${clockTime('tr', start)} – ${clockTime('tr', end)}`,
    );
    expect(timeRange(tr, 'tr', pump({ side: 'L' }), dayStart(25))).toBe(
      tr('log.range.running', { start: clockTime('tr', start) }),
    );
  });

  it('a running timer', () => {
    const start = at(25, 22, 10);
    expect(
      timeRange(tr, 'tr', ev({ type: 'sleep', babyId: 'a', startAt: start }), dayStart(25)),
    ).toBe(tr('log.range.running', { start: clockTime('tr', start) }));
  });
});

describe('dayLabel', () => {
  it('today, yesterday, otherwise the weekday and the date', () => {
    expect(dayLabel(tr, 'tr', dayStart(25), NOW)).toBe(tr('day.today'));
    expect(dayLabel(tr, 'tr', dayStart(24), NOW)).toBe(tr('day.yesterday'));
    expect(dayLabel(en, 'en', dayStart(24), NOW)).toBe('Yesterday');
    const sunday = dayStart(20);
    const longWeekday = new Intl.DateTimeFormat('tr', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(sunday);
    expect(dayLabel(tr, 'tr', sunday, NOW)).toBe(longWeekday);
    const dayAndMonth = new Intl.DateTimeFormat('tr', { day: 'numeric', month: 'long' }).format(
      sunday,
    );
    expect(dayLabel(tr, 'tr', sunday, NOW)).toContain(dayAndMonth);
  });
});

describe('formatMeasurement and hasAlert', () => {
  it('shows grams as kg and millimetres as cm', () => {
    expect(formatMeasurement('tr', 'weightG', 3100)).toBe('3,1 kg');
    // stored in whole grams, shown exactly
    expect(formatMeasurement('tr', 'weightG', 3453)).toBe('3,453 kg');
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

it('typeIcon covers every event type', () => {
  const types = [
    'sleep',
    'breastfeed',
    'bottle',
    'diaper',
    'pump',
    'growth',
    'temperature',
    'medication',
    'healthNote',
  ] as const;
  expect(types.map(typeIcon)).toEqual([
    'moon',
    'heart',
    'milk',
    'baby',
    'droplets',
    'ruler',
    'thermometer',
    'pill',
    'notebook-pen',
  ]);
});
