import { describe, expect, it } from 'vitest';
import { forgottenTimer, temperatureAlert } from '../../src/domain/health';
import { HOUR, MINUTE } from '../../src/domain/time';
import type { EventDraft, TrackerEvent } from '../../src/domain/types';

const NOW = new Date(2026, 8, 25, 12, 0).getTime();
const ev = (draft: EventDraft, extra: Partial<TrackerEvent> = {}): TrackerEvent =>
  ({ ...draft, id: 'e', createdAt: NOW, updatedAt: NOW, ...extra }) as TrackerEvent;

describe('temperatureAlert', () => {
  it.each([
    [38, 'fever'],
    [39.5, 'fever'],
    [37.9, null],
    [36, null],
    [35.9, 'low'],
    [30, 'low'],
    [29.9, null],
    [45.1, null],
    [Number.NaN, null],
  ] as const)('%s °C → %s', (celsius, alert) => {
    expect(temperatureAlert(celsius)).toBe(alert);
  });
});

describe('forgottenTimer', () => {
  it('a sleep running for more than 12 hours', () => {
    expect(
      forgottenTimer(ev({ type: 'sleep', babyId: 'a', startAt: NOW - 12 * HOUR - MINUTE }), NOW),
    ).toBe(true);
    expect(forgottenTimer(ev({ type: 'sleep', babyId: 'a', startAt: NOW - 12 * HOUR }), NOW)).toBe(
      false,
    );
  });

  it('a feed running for more than 2 hours', () => {
    const start = NOW - 2 * HOUR - MINUTE;
    expect(
      forgottenTimer(
        ev({ type: 'breastfeed', babyId: 'a', startAt: start, segments: [{ side: 'L', start }] }),
        NOW,
      ),
    ).toBe(true);
    const recent = NOW - 2 * HOUR;
    expect(
      forgottenTimer(
        ev({
          type: 'breastfeed',
          babyId: 'a',
          startAt: recent,
          segments: [{ side: 'L', start: recent }],
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('a pump running for more than 2 hours', () => {
    const pump = (startAt: number) => ev({ type: 'pump', babyId: null, startAt, side: 'B' });
    expect(forgottenTimer(pump(NOW - 2 * HOUR - MINUTE), NOW)).toBe(true);
    expect(forgottenTimer(pump(NOW - 2 * HOUR), NOW)).toBe(false);
  });

  it('never a finished, deleted or instant entry', () => {
    const old = NOW - 20 * HOUR;
    expect(forgottenTimer(ev({ type: 'sleep', babyId: 'a', startAt: old, endAt: NOW }), NOW)).toBe(
      false,
    );
    expect(
      forgottenTimer(ev({ type: 'sleep', babyId: 'a', startAt: old }, { deletedAt: NOW }), NOW),
    ).toBe(false);
    expect(
      forgottenTimer(
        ev({ type: 'diaper', babyId: 'a', startAt: old, wet: true, dirty: false }),
        NOW,
      ),
    ).toBe(false);
  });
});
