import { describe, expect, it } from 'vitest';
import { MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';
import { babyStatus } from '../../src/domain/status';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();
let seq = 0;
function ev(draft: EventDraft, extra: Partial<TrackerEvent> = {}): TrackerEvent {
  seq += 1;
  return { ...draft, id: `e${seq}`, createdAt: NOW, updatedAt: NOW, ...extra } as TrackerEvent;
}

describe('babyStatus', () => {
  it('is empty without events', () => {
    expect(babyStatus([], 'a')).toEqual({
      lastFeed: null,
      runningFeed: null,
      sleep: { state: 'awake', since: null },
      lastDiaper: null,
    });
  });

  it('picks the latest feed across breastfeeding and bottles', () => {
    const events = [
      ev({ type: 'bottle', babyId: 'a', startAt: NOW - 200 * MINUTE, ml: 90, contents: 'formula' }),
      ev({
        type: 'breastfeed', babyId: 'a', startAt: NOW - 100 * MINUTE, endAt: NOW - 80 * MINUTE,
        segments: [{ side: 'L', start: NOW - 100 * MINUTE, end: NOW - 90 * MINUTE }, { side: 'R', start: NOW - 90 * MINUTE, end: NOW - 80 * MINUTE }],
      }),
    ];
    expect(babyStatus(events, 'a').lastFeed).toEqual({ at: NOW - 100 * MINUTE, kind: 'breastfeed', side: 'R' });
    const withLaterBottle = [...events, ev({ type: 'bottle', babyId: 'a', startAt: NOW - 10 * MINUTE, ml: 120, contents: 'breastmilk' })];
    expect(babyStatus(withLaterBottle, 'a').lastFeed).toEqual({ at: NOW - 10 * MINUTE, kind: 'bottle', ml: 120 });
  });

  it('reports a running feed with its current side', () => {
    const running = ev({
      type: 'breastfeed', babyId: 'a', startAt: NOW - 12 * MINUTE,
      segments: [{ side: 'L', start: NOW - 12 * MINUTE, end: NOW - 5 * MINUTE }, { side: 'R', start: NOW - 5 * MINUTE }],
    });
    expect(babyStatus([running], 'a').runningFeed).toEqual({
      eventId: running.id, startAt: NOW - 12 * MINUTE, side: 'R', segmentStart: NOW - 5 * MINUTE,
    });
  });

  it('is asleep while a sleep is running, otherwise awake since the last wake-up', () => {
    const open = ev({ type: 'sleep', babyId: 'a', startAt: NOW - 45 * MINUTE });
    expect(babyStatus([open], 'a').sleep).toEqual({ state: 'asleep', since: NOW - 45 * MINUTE, eventId: open.id });
    const naps = [
      ev({ type: 'sleep', babyId: 'a', startAt: NOW - 300 * MINUTE, endAt: NOW - 240 * MINUTE }),
      ev({ type: 'sleep', babyId: 'a', startAt: NOW - 120 * MINUTE, endAt: NOW - 70 * MINUTE }),
    ];
    expect(babyStatus(naps, 'a').sleep).toEqual({ state: 'awake', since: NOW - 70 * MINUTE });
  });

  it('reports the last diaper', () => {
    const events = [
      ev({ type: 'diaper', babyId: 'a', startAt: NOW - 90 * MINUTE, wet: true, dirty: false }),
      ev({ type: 'diaper', babyId: 'a', startAt: NOW - 30 * MINUTE, wet: true, dirty: true, stoolColor: 'yellow' }),
    ];
    expect(babyStatus(events, 'a').lastDiaper).toEqual({ at: NOW - 30 * MINUTE, wet: true, dirty: true });
  });

  it('ignores other babies and deleted events', () => {
    const events = [
      ev({ type: 'diaper', babyId: 'b', startAt: NOW - 10 * MINUTE, wet: true, dirty: false }),
      ev({ type: 'diaper', babyId: 'a', startAt: NOW - 5 * MINUTE, wet: true, dirty: false }, { deletedAt: NOW }),
    ];
    expect(babyStatus(events, 'a').lastDiaper).toBeNull();
  });
});
