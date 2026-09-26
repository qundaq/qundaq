import type { Baby, TrackerEvent } from '../domain/types';
import type { Locale } from '../i18n';
import type { EventRow, TrackerDb } from './db';
import { loadSettings, type Settings } from './settings';

/** Everything this device holds, read in one transaction. */
export interface LocalData {
  babies: Baby[];
  events: TrackerEvent[];
  settings: Settings;
}

/** The row without the storage-only `open` marker. Every other field stays, malformed or not. */
export function withoutOpen(row: EventRow): TrackerEvent {
  const { open: _open, ...event } = row;
  return event as TrackerEvent;
}

export async function readSnapshot(db: TrackerDb, fallbackLocale: Locale): Promise<LocalData> {
  return db.transaction('r', db.babies, db.events, db.settings, async () => {
    // Sorted here, not through the createdAt index: a row whose createdAt is missing or not a valid key is
    // left out of that index, and the backup must still carry it. Ordered as Ayarlar lists them.
    const babies = (await db.babies.toArray()).sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    const events = await db.events.toArray();
    const settings = await loadSettings(db, fallbackLocale);
    return { babies, events: events.map(withoutOpen), settings };
  });
}
