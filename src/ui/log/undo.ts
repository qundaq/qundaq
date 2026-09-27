import type { EventChange } from '../../db/events';
import type { Id, TrackerEvent } from '../../domain/types';
import type { TranslateFn } from '../app/I18nProvider';
import { typeLabel } from '../history/describe';
import { formatDuration } from '../shared/format';

function who(t: TranslateFn, rows: readonly TrackerEvent[], nameOf: (id: Id) => string): string {
  const ids = [...new Set(rows.map((row) => row.babyId).filter((id): id is Id => id !== null))];
  if (ids.length === 1) return nameOf(ids[0]!);
  if (ids.length === 2) return t('toast.who.two', { a: nameOf(ids[0]!), b: nameOf(ids[1]!) });
  return t('toast.who.many', { n: ids.length });
}

/**
 * The toast after a write. A save names what it created (a timer it also stopped was announced in the
 * sheet beforehand); a stop from a card says how long the timer ran.
 */
export function undoMessage(
  t: TranslateFn,
  changes: readonly EventChange[],
  nameOf: (babyId: Id) => string,
): string {
  const created = changes.filter((change) => change.before === null).map((change) => change.after);
  if (created.length === 0) {
    const stopped = changes.map((change) => change.after);
    const first = stopped[0]!;
    const duration = formatDuration(t, (first.endAt ?? first.startAt) - first.startAt);
    const name = who(t, stopped, nameOf);
    return first.type === 'sleep'
      ? t('toast.wokeUp', { who: name, duration })
      : t('toast.feedEnded', { who: name, duration });
  }
  const first = created[0]!;
  const name = who(t, created, nameOf);
  switch (first.type) {
    case 'pump':
      return t('toast.pump');
    case 'bottle':
      return t('toast.bottle', { who: name, ml: first.ml });
    case 'diaper':
      return t('toast.diaper', { who: name });
    case 'sleep':
      return first.endAt === undefined
        ? t('toast.sleepStarted', { who: name })
        : t('toast.saved', { who: name, type: typeLabel(t, 'sleep') });
    case 'breastfeed':
      return first.endAt === undefined
        ? t('toast.feedStarted', { who: name, side: t(`side.${first.segments[0]!.side}.button`) })
        : t('toast.saved', { who: name, type: typeLabel(t, 'breastfeed') });
    default:
      return t('toast.saved', { who: name, type: typeLabel(t, first.type) });
  }
}
