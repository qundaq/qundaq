import { describe, expect, it } from 'vitest';
import type { EventChange } from '../../src/db/events';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { describeEvent, typeLabel } from '../../src/ui/history/describe';
import { formatDuration } from '../../src/ui/shared/format';
import { undoMessage } from '../../src/ui/log/undo';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const names: Record<string, string> = { a: 'Ada', b: 'Amy', c: 'Cal' };
const nameOf = (id: string) => names[id] ?? '?';
const T = new Date(2026, 8, 27, 3, 0).getTime();
const row = (fields: Record<string, unknown>): TrackerEvent =>
  ({
    id: String(Math.random()),
    createdAt: T,
    updatedAt: T,
    startAt: T,
    ...fields,
  }) as TrackerEvent;
const created = (...rows: TrackerEvent[]): EventChange[] =>
  rows.map((after) => ({ before: null, after }));

describe('undoMessage', () => {
  it('names one, two or many babies', () => {
    const diaper = { type: 'diaper', wet: true, dirty: false };
    expect(undoMessage(t, 'tr', created(row({ ...diaper, babyId: 'a' })), nameOf)).toBe(
      t('toast.diaper', { who: 'Ada' }),
    );
    expect(
      undoMessage(
        t,
        'tr',
        created(row({ ...diaper, babyId: 'a' }), row({ ...diaper, babyId: 'b' })),
        nameOf,
      ),
    ).toBe(t('toast.diaper', { who: t('toast.who.two', { a: 'Ada', b: 'Amy' }) }));
    expect(
      undoMessage(
        t,
        'tr',
        created(
          row({ ...diaper, babyId: 'a' }),
          row({ ...diaper, babyId: 'b' }),
          row({ ...diaper, babyId: 'c' }),
        ),
        nameOf,
      ),
    ).toBe(t('toast.diaper', { who: t('toast.who.many', { n: 3 }) }));
  });

  it('says what was saved or started', () => {
    expect(
      undoMessage(
        t,
        'tr',
        created(row({ type: 'bottle', babyId: 'a', ml: 90, contents: 'formula' })),
        nameOf,
      ),
    ).toBe(t('toast.bottle', { who: 'Ada', ml: 90 }));
    expect(undoMessage(t, 'tr', created(row({ type: 'sleep', babyId: 'a' })), nameOf)).toBe(
      t('toast.sleepStarted', { who: 'Ada' }),
    );
    expect(
      undoMessage(
        t,
        'tr',
        created(row({ type: 'breastfeed', babyId: 'b', segments: [{ side: 'R', start: T }] })),
        nameOf,
      ),
    ).toBe(t('toast.feedStarted', { who: 'Amy', side: t('side.R.button') }));
    expect(
      undoMessage(
        t,
        'tr',
        created(row({ type: 'sleep', babyId: 'a', endAt: T + 40 * MINUTE })),
        nameOf,
      ),
    ).toBe(t('toast.saved', { who: 'Ada', type: typeLabel(t, 'sleep') }));
    expect(
      undoMessage(t, 'tr', created(row({ type: 'pump', babyId: null, mlLeft: 60 })), nameOf),
    ).toBe(t('toast.pump'));
    expect(
      undoMessage(t, 'tr', created(row({ type: 'medication', babyId: 'a', name: 'D' })), nameOf),
    ).toBe(t('toast.saved', { who: 'Ada', type: typeLabel(t, 'medication') }));
  });

  it('a pump start names its side, also when it ended an earlier pump; a stop says how long it ran', () => {
    expect(
      undoMessage(t, 'tr', created(row({ type: 'pump', babyId: null, side: 'B' })), nameOf),
    ).toBe(t('toast.pumpStarted', { side: t('side.B.button') }));
    const earlier = row({ type: 'pump', babyId: null, startAt: T - 20 * MINUTE, side: 'L' });
    const ended = { ...earlier, endAt: T, minLeft: 20 } as TrackerEvent;
    expect(
      undoMessage(
        t,
        'tr',
        [
          { before: earlier, after: ended },
          ...created(row({ type: 'pump', babyId: null, side: 'R' })),
        ],
        nameOf,
      ),
    ).toBe(t('toast.pumpStarted', { side: t('side.R.button') }));
    expect(undoMessage(t, 'tr', [{ before: earlier, after: ended }], nameOf)).toBe(
      t('toast.pumpEnded', { detail: `${t('side.L.button')} ${t('time.minutes', { m: 20 })}` }),
    );
    expect(translate('en', 'toast.pumpEnded', { detail: 'Left 20 min' })).toBe(
      'Pumping ended · Left 20 min',
    );
  });

  it('a stopped pump says what it recorded, as its log row does, not how long the session ran', () => {
    // Ran 8 minutes; the stop sheet corrected it to 15 on the right and added 80 ml.
    const running = row({ type: 'pump', babyId: null, startAt: T - 8 * MINUTE, side: 'R' });
    const corrected = { ...running, endAt: T, minRight: 15, mlRight: 80 } as TrackerEvent;
    const message = undoMessage(t, 'tr', [{ before: running, after: corrected }], nameOf);
    expect(message).toBe(t('toast.pumpEnded', { detail: describeEvent(t, 'tr', corrected, T) }));
    expect(message).toContain(t('time.minutes', { m: 15 }));
    expect(message).not.toContain(t('time.minutes', { m: 8 }));
    // Both sides at once: each side's minutes.
    const both = row({ type: 'pump', babyId: null, startAt: T - 20 * MINUTE, side: 'B' });
    expect(
      undoMessage(
        (key, vars) => translate('en', key, vars),
        'en',
        [{ before: both, after: { ...both, endAt: T, minLeft: 20, minRight: 20 } as TrackerEvent }],
        nameOf,
      ),
    ).toBe(
      translate('en', 'toast.pumpEnded', {
        detail: `${translate('en', 'side.L.button')} 20 min · ${translate('en', 'side.R.button')} 20 min`,
      }),
    );
  });

  it('a feed that ended a sleep is announced as the feed', () => {
    const sleeping = row({ type: 'sleep', babyId: 'a', startAt: T - 40 * MINUTE });
    const changes: EventChange[] = [
      { before: sleeping, after: { ...sleeping, endAt: T } },
      ...created(row({ type: 'breastfeed', babyId: 'a', segments: [{ side: 'L', start: T }] })),
    ];
    expect(undoMessage(t, 'tr', changes, nameOf)).toBe(
      t('toast.feedStarted', { who: 'Ada', side: t('side.L.button') }),
    );
  });

  it('a stop says how long it lasted', () => {
    const sleeping = row({ type: 'sleep', babyId: 'a', startAt: T - 42 * MINUTE });
    expect(
      undoMessage(t, 'tr', [{ before: sleeping, after: { ...sleeping, endAt: T } }], nameOf),
    ).toBe(t('toast.wokeUp', { who: 'Ada', duration: formatDuration(t, 42 * MINUTE) }));
    const feeding = row({
      type: 'breastfeed',
      babyId: 'b',
      startAt: T - 18 * MINUTE,
      segments: [],
    });
    expect(
      undoMessage(t, 'tr', [{ before: feeding, after: { ...feeding, endAt: T } }], nameOf),
    ).toBe(t('toast.feedEnded', { who: 'Amy', duration: formatDuration(t, 18 * MINUTE) }));
  });
});
