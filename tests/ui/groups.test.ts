import { describe, expect, it } from 'vitest';
import { translate, type MessageKey } from '../../src/i18n';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';
import { describeEvent } from '../../src/ui/history/describe';
import { groupByActivity, groupSummary } from '../../src/ui/history/groups';

const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const at = (hour: number, minute = 0, day = 25) => new Date(2026, 8, day, hour, minute).getTime();
const NOW = at(12);
let seq = 0;
function ev(draft: EventDraft, id?: string): TrackerEvent {
  seq += 1;
  return { ...draft, id: id ?? `e${seq}`, createdAt: 0, updatedAt: 0 };
}
const feed = (start: number, sides: ['L' | 'R', number][], running = false, id?: string) => {
  let cursor = start;
  const segments = sides.map(([side, ms], index) => {
    const segment = {
      side,
      start: cursor,
      ...(running && index === sides.length - 1 ? {} : { end: cursor + ms }),
    };
    cursor += ms;
    return segment;
  });
  return ev(
    {
      type: 'breastfeed',
      babyId: 'a',
      startAt: start,
      ...(running ? {} : { endAt: cursor }),
      segments,
    },
    id,
  );
};

describe('groupByActivity', () => {
  it('has one group per type in the fixed order, empty groups omitted', () => {
    const events = [
      ev({ type: 'healthNote', babyId: 'a', startAt: at(1) }),
      ev({ type: 'medication', babyId: 'a', startAt: at(2), name: 'x' }),
      ev({ type: 'temperature', babyId: 'a', startAt: at(3), celsius: 37 }),
      ev({ type: 'growth', babyId: 'a', startAt: at(4), weightG: 3000 }),
      ev({ type: 'pump', babyId: null, startAt: at(5), endAt: at(5, 10), minLeft: 10 }),
      ev({ type: 'diaper', babyId: 'a', startAt: at(6), wet: true, dirty: false }),
      ev({ type: 'sleep', babyId: 'a', startAt: at(7), endAt: at(8) }),
      ev({ type: 'bottle', babyId: 'a', startAt: at(9), ml: 90, contents: 'formula' }),
      feed(at(10), [['L', 5 * MINUTE]]),
    ];
    expect(groupByActivity(events).map((g) => g.type)).toEqual([
      'breastfeed',
      'bottle',
      'sleep',
      'diaper',
      'pump',
      'growth',
      'temperature',
      'medication',
      'healthNote',
    ]);
    expect(groupByActivity(events.slice(0, 2)).map((g) => g.type)).toEqual([
      'medication',
      'healthNote',
    ]);
    expect(groupByActivity([])).toEqual([]);
  });

  it('orders oldest first, ties by id, and puts each event in exactly one group', () => {
    const late = ev({ type: 'diaper', babyId: 'a', startAt: at(9), wet: true, dirty: false }, 'a1');
    const early = ev({ type: 'diaper', babyId: 'a', startAt: at(7), wet: true, dirty: false }, 'z');
    const tieB = ev({ type: 'diaper', babyId: 'a', startAt: at(8), wet: true, dirty: false }, 'b');
    const tieA = ev({ type: 'diaper', babyId: 'a', startAt: at(8), wet: true, dirty: false }, 'a');
    const sleep = ev({ type: 'sleep', babyId: 'a', startAt: at(1), endAt: at(2) }, 's');
    const input = [late, tieB, early, sleep, tieA];
    const groups = groupByActivity(input);
    expect(groups.find((g) => g.type === 'diaper')!.events.map((e) => e.id)).toEqual([
      'z',
      'a',
      'b',
      'a1',
    ]);
    const all = groups.flatMap((g) => g.events.map((e) => e.id));
    expect([...all].sort()).toEqual(input.map((e) => e.id).sort());
    expect(input.map((e) => e.id)).toEqual(['a1', 'b', 'z', 's', 'a']);
  });

  it('leaves deleted entries out', () => {
    const gone = {
      ...ev({ type: 'sleep', babyId: 'a', startAt: at(1), endAt: at(2) }),
      deletedAt: 5,
    };
    expect(groupByActivity([gone])).toEqual([]);
  });
});

describe('groupSummary', () => {
  const summary = (events: TrackerEvent[], type: TrackerEvent['type']) =>
    groupSummary(
      groupByActivity(events).find((g) => g.type === type)!,
      NOW,
    );

  it('counts only for types without a total', () => {
    const d = ev({ type: 'diaper', babyId: 'a', startAt: at(6), wet: true, dirty: false });
    expect(summary([d, d], 'diaper')).toEqual({ count: 2 });
  });

  it('breastfeed minutes equal the sum of the minutes the rows show', () => {
    const feeds = [
      feed(at(8), [
        ['L', 12 * MINUTE],
        ['R', 8 * MINUTE],
      ]),
      feed(at(9), [['L', 20 * 1000]]),
      feed(at(10), [
        ['L', 5 * MINUTE],
        ['L', 4 * MINUTE + 40 * 1000],
      ]),
    ];
    const rowMinutes = feeds
      .map((f) =>
        [...describeEvent(tr, 'tr', f, NOW).matchAll(/(\d+) dk/g)].reduce(
          (sum, m) => sum + Number(m[1]),
          0,
        ),
      )
      .reduce((a, b) => a + b, 0);
    expect(rowMinutes).toBeGreaterThan(0);
    expect(summary(feeds, 'breastfeed')).toEqual({ count: 3, minutes: rowMinutes });
  });

  it('a running feed adds to the count only: its row says "ongoing", not minutes', () => {
    const running = feed(at(11, 30), [['L', 10 * MINUTE]], true);
    expect(describeEvent(tr, 'tr', running, NOW)).toBe(
      `${tr('side.L.button')} · ${tr('log.ongoing')}`,
    );
    expect(summary([running], 'breastfeed')).toEqual({ count: 1, minutes: 0 });
    const done = feed(at(9), [['L', 12 * MINUTE]]);
    expect(summary([done, running], 'breastfeed')).toEqual({ count: 2, minutes: 12 });
  });

  it('bottle sums ml', () => {
    const bottles = [60, 90].map((ml) =>
      ev({ type: 'bottle', babyId: 'a', startAt: at(9), ml, contents: 'formula' }),
    );
    expect(summary(bottles, 'bottle')).toEqual({ count: 2, ml: 150 });
  });

  it('sleep minutes match the row durations, a running sleep up to now', () => {
    const done = ev({ type: 'sleep', babyId: 'a', startAt: at(1), endAt: at(1, 45) });
    const running = ev({ type: 'sleep', babyId: 'a', startAt: at(10, 30) });
    expect(summary([done, running], 'sleep')).toEqual({ count: 2, minutes: 45 + 90 });
    expect(HOUR).toBe(60 * MINUTE);
  });

  it('pump uses minutes when any, else ml, and a running pump adds nothing', () => {
    const minutes = ev({
      type: 'pump',
      babyId: null,
      startAt: at(5),
      endAt: at(5, 20),
      minLeft: 12,
      minRight: 8,
      mlLeft: 50,
    });
    const mlOnly = ev({
      type: 'pump',
      babyId: null,
      startAt: at(6),
      endAt: at(6),
      mlLeft: 60,
      mlRight: 40,
    });
    const running = ev({ type: 'pump', babyId: null, startAt: at(11), side: 'L' });
    expect(summary([minutes, mlOnly, running], 'pump')).toEqual({ count: 3, minutes: 20 });
    expect(summary([mlOnly, running], 'pump')).toEqual({ count: 2, ml: 100 });
    expect(summary([running], 'pump')).toEqual({ count: 1 });
  });
});
