import { describe, expect, it } from 'vitest';
import type { BabyStatus } from '../../src/domain/status';
import type { DailyTotals } from '../../src/domain/summary';
import { HOUR, MINUTE } from '../../src/domain/time';
import { translate, type MessageKey } from '../../src/i18n';
import { ageText, statTiles, todayLine } from '../../src/ui/home/cardModel';
import { clockTime } from '../../src/ui/history/describe';
import { formatDuration } from '../../src/ui/shared/format';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const NOW = new Date(2026, 8, 27, 21, 30).getTime();
const empty: BabyStatus = {
  lastFeed: null,
  runningFeed: null,
  sleep: { state: 'awake', since: null },
  lastDiaper: null,
};
const totals = (fields: Partial<DailyTotals>): DailyTotals => ({
  feeds: 0,
  breastMs: 0,
  breastMsBySide: { L: 0, R: 0 },
  bottleMl: 0,
  bottles: 0,
  sleepMs: 0,
  sleeps: 0,
  wet: 0,
  dirty: 0,
  diapers: 0,
  ...fields,
});

describe('ageText', () => {
  it('reads the age in the unit the card uses; a newborn is not "0 days"', () => {
    expect(ageText(t, null)).toBeNull();
    expect(ageText(t, { unit: 'days', n: 0 })).toBe(t('age.newborn'));
    expect(ageText(t, { unit: 'days', n: 5 })).toBe(t('age.days', { n: 5 }));
    expect(ageText(t, { unit: 'weeks', n: 7 })).toBe(t('age.weeks', { n: 7 }));
    expect(ageText(t, { unit: 'months', n: 5 })).toBe(t('age.months', { n: 5 }));
    expect(ageText(t, { unit: 'years', n: 2 })).toBe(t('age.years', { n: 2 }));
  });
});

describe('statTiles', () => {
  it('says "no entry" for a baby with no history', () => {
    expect(statTiles(t, 'tr', empty, NOW)).toEqual([
      { label: t('status.feed'), value: '—', caption: t('tile.none') },
      { label: t('status.sleep'), value: '—', caption: t('tile.none') },
      { label: t('status.diaper'), value: '—', caption: t('tile.none') },
    ]);
  });

  it('reads time since the last entry with its detail', () => {
    const status: BabyStatus = {
      lastFeed: { at: NOW - (2 * HOUR + 10 * MINUTE), kind: 'breastfeed', side: 'L' },
      runningFeed: null,
      sleep: { state: 'awake', since: NOW - 65 * MINUTE },
      lastDiaper: { at: NOW - 35 * MINUTE, wet: true, dirty: true },
    };
    expect(statTiles(t, 'tr', status, NOW)).toEqual([
      {
        label: t('status.feed'),
        value: formatDuration(t, 2 * HOUR + 10 * MINUTE),
        caption: t('tile.agoDetail', { detail: t('side.L') }),
      },
      {
        label: t('status.sleep'),
        value: formatDuration(t, 65 * MINUTE),
        caption: t('tile.awake'),
      },
      {
        label: t('status.diaper'),
        value: formatDuration(t, 35 * MINUTE),
        caption: t('tile.agoDetail', { detail: t('diaper.both') }),
      },
    ]);
  });

  it('a bottle shows its amount; under a minute reads "just now"', () => {
    const status: BabyStatus = { ...empty, lastFeed: { at: NOW - 20_000, kind: 'bottle', ml: 90 } };
    expect(statTiles(t, 'tr', status, NOW)[0]).toEqual({
      label: t('status.feed'),
      value: t('time.justNow'),
      caption: t('unit.ml', { ml: 90 }),
    });
  });

  it('the sleep tile reads "just now" (awake) for the first minute after a wake-up', () => {
    const status: BabyStatus = { ...empty, sleep: { state: 'awake', since: NOW - 20_000 } };
    expect(statTiles(t, 'tr', status, NOW)[1]).toEqual({
      label: t('status.sleep'),
      value: t('time.justNow'),
      caption: t('tile.awake'),
    });
  });

  it('while a timer runs, its tile says so', () => {
    const status: BabyStatus = {
      ...empty,
      runningFeed: {
        eventId: 'f',
        startAt: NOW - 5 * MINUTE,
        side: 'R',
        segmentStart: NOW - 5 * MINUTE,
      },
      sleep: { state: 'asleep', since: new Date(2026, 8, 27, 20, 48).getTime(), eventId: 's' },
    };
    const [feed, sleep] = statTiles(t, 'tr', status, NOW);
    expect(feed).toEqual({ label: t('status.feed'), value: t('tile.now'), caption: t('side.R') });
    expect(sleep).toEqual({
      label: t('status.sleep'),
      value: t('tile.asleep'),
      caption: t('tile.started', {
        time: clockTime('tr', new Date(2026, 8, 27, 20, 48).getTime()),
      }),
    });
  });
});

describe('todayLine', () => {
  it('leaves zero parts out and says so when the day is empty', () => {
    expect(todayLine(t, totals({}))).toBe(t('today.empty'));
    expect(
      todayLine(
        t,
        totals({ feeds: 6, bottleMl: 240, sleepMs: 9 * HOUR + 20 * MINUTE, diapers: 7 }),
      ),
    ).toBe(
      t('today.line', {
        parts: [
          t('today.feeds', { n: 6 }),
          t('today.ml', { ml: 240 }),
          t('today.sleep', { duration: formatDuration(t, 9 * HOUR + 20 * MINUTE) }),
          t('today.diapers', { n: 7 }),
        ].join(' · '),
      }),
    );
    expect(todayLine(t, totals({ feeds: 1, diapers: 1 }))).toBe(
      t('today.line', { parts: [t('today.feeds.one'), t('today.diapers.one')].join(' · ') }),
    );
    expect(translate('en', 'today.feeds.one')).toBe('1 feed');
  });
});
