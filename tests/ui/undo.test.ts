import { describe, expect, it } from 'vitest';
import type { EventChange } from '../../src/db/events';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { typeLabel } from '../../src/ui/history/describe';
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
    expect(undoMessage(t, created(row({ ...diaper, babyId: 'a' })), nameOf)).toBe(
      t('toast.diaper', { who: 'Ada' }),
    );
    expect(
      undoMessage(
        t,
        created(row({ ...diaper, babyId: 'a' }), row({ ...diaper, babyId: 'b' })),
        nameOf,
      ),
    ).toBe(t('toast.diaper', { who: t('toast.who.two', { a: 'Ada', b: 'Amy' }) }));
    expect(
      undoMessage(
        t,
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
        created(row({ type: 'bottle', babyId: 'a', ml: 90, contents: 'formula' })),
        nameOf,
      ),
    ).toBe(t('toast.bottle', { who: 'Ada', ml: 90 }));
    expect(undoMessage(t, created(row({ type: 'sleep', babyId: 'a' })), nameOf)).toBe(
      t('toast.sleepStarted', { who: 'Ada' }),
    );
    expect(
      undoMessage(
        t,
        created(row({ type: 'breastfeed', babyId: 'b', segments: [{ side: 'R', start: T }] })),
        nameOf,
      ),
    ).toBe(t('toast.feedStarted', { who: 'Amy', side: t('side.R.button') }));
    expect(
      undoMessage(t, created(row({ type: 'sleep', babyId: 'a', endAt: T + 40 * MINUTE })), nameOf),
    ).toBe(t('toast.saved', { who: 'Ada', type: typeLabel(t, 'sleep') }));
    expect(undoMessage(t, created(row({ type: 'pump', babyId: null, mlLeft: 60 })), nameOf)).toBe(
      t('toast.pump'),
    );
    expect(
      undoMessage(t, created(row({ type: 'medication', babyId: 'a', name: 'D' })), nameOf),
    ).toBe(t('toast.saved', { who: 'Ada', type: typeLabel(t, 'medication') }));
  });

  it('a feed that ended a sleep is announced as the feed', () => {
    const sleeping = row({ type: 'sleep', babyId: 'a', startAt: T - 40 * MINUTE });
    const changes: EventChange[] = [
      { before: sleeping, after: { ...sleeping, endAt: T } },
      ...created(row({ type: 'breastfeed', babyId: 'a', segments: [{ side: 'L', start: T }] })),
    ];
    expect(undoMessage(t, changes, nameOf)).toBe(
      t('toast.feedStarted', { who: 'Ada', side: t('side.L.button') }),
    );
  });

  it('a stop says how long it lasted', () => {
    const sleeping = row({ type: 'sleep', babyId: 'a', startAt: T - 42 * MINUTE });
    expect(undoMessage(t, [{ before: sleeping, after: { ...sleeping, endAt: T } }], nameOf)).toBe(
      t('toast.wokeUp', { who: 'Ada', duration: formatDuration(t, 42 * MINUTE) }),
    );
    const feeding = row({
      type: 'breastfeed',
      babyId: 'b',
      startAt: T - 18 * MINUTE,
      segments: [],
    });
    expect(undoMessage(t, [{ before: feeding, after: { ...feeding, endAt: T } }], nameOf)).toBe(
      t('toast.feedEnded', { who: 'Amy', duration: formatDuration(t, 18 * MINUTE) }),
    );
  });
});
