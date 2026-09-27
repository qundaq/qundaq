import type { BabyAge } from '../../domain/age';
import type { BabyStatus } from '../../domain/status';
import type { DailyTotals } from '../../domain/summary';
import { MINUTE } from '../../domain/time';
import type { Locale } from '../../i18n';
import type { TranslateFn } from '../app/I18nProvider';
import { clockTime } from '../history/describe';
import { formatDuration } from '../shared/format';

export interface Tile {
  label: string;
  value: string;
  caption: string;
}

export function ageText(t: TranslateFn, age: BabyAge | null): string | null {
  if (age === null) return null;
  if (age.unit === 'days' && age.n === 0) return t('age.newborn');
  return t(`age.${age.unit}`, { n: age.n });
}

/** Value and caption for "time since": "2h 10m" + "ago · left", or "just now" + "left" under a minute. */
function since(t: TranslateFn, ms: number, detail: string): Pick<Tile, 'value' | 'caption'> {
  return ms < MINUTE
    ? { value: t('time.justNow'), caption: detail }
    : { value: formatDuration(t, ms), caption: t('tile.agoDetail', { detail }) };
}

/** The card's three glance tiles: feed, sleep, diaper. */
export function statTiles(t: TranslateFn, locale: Locale, status: BabyStatus, now: number): Tile[] {
  const none = { value: '—', caption: t('tile.none') };

  let feed: Pick<Tile, 'value' | 'caption'> = none;
  if (status.runningFeed)
    feed = { value: t('tile.now'), caption: t(`side.${status.runningFeed.side}`) };
  else if (status.lastFeed) {
    const detail =
      status.lastFeed.kind === 'breastfeed'
        ? t(`side.${status.lastFeed.side}`)
        : t('unit.ml', { ml: status.lastFeed.ml });
    feed = since(t, now - status.lastFeed.at, detail);
  }

  let sleep: Pick<Tile, 'value' | 'caption'> = none;
  if (status.sleep.state === 'asleep')
    sleep = {
      value: t('tile.asleep'),
      caption: t('tile.started', { time: clockTime(locale, status.sleep.since) }),
    };
  else if (status.sleep.since !== null) {
    const awakeMs = now - status.sleep.since;
    sleep = {
      value: awakeMs < MINUTE ? t('time.justNow') : formatDuration(t, awakeMs),
      caption: t('tile.awake'),
    };
  }

  let diaper: Pick<Tile, 'value' | 'caption'> = none;
  if (status.lastDiaper) {
    const { wet, dirty, at } = status.lastDiaper;
    const kind = wet && dirty ? t('diaper.both') : dirty ? t('diaper.dirty') : t('diaper.wet');
    diaper = since(t, now - at, kind);
  }

  return [
    { label: t('status.feed'), ...feed },
    { label: t('status.sleep'), ...sleep },
    { label: t('status.diaper'), ...diaper },
  ];
}

/** today.line ("Today 6 feeds · 240 ml · 9h 20m sleep · 7 diapers"): parts that are zero are left out. */
export function todayLine(t: TranslateFn, totals: DailyTotals): string {
  const parts: string[] = [];
  if (totals.feeds > 0)
    parts.push(totals.feeds === 1 ? t('today.feeds.one') : t('today.feeds', { n: totals.feeds }));
  if (totals.bottleMl > 0) parts.push(t('today.ml', { ml: totals.bottleMl }));
  if (totals.sleepMs >= MINUTE)
    parts.push(t('today.sleep', { duration: formatDuration(t, totals.sleepMs) }));
  if (totals.diapers > 0)
    parts.push(
      totals.diapers === 1 ? t('today.diapers.one') : t('today.diapers', { n: totals.diapers }),
    );
  return parts.length === 0 ? t('today.empty') : t('today.line', { parts: parts.join(' · ') });
}
