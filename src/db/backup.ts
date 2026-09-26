import { planImport, planSignature, type ImportOptions, type ImportPlan } from '../backup/merge';
import type { ParsedBackup } from '../backup/validate';
import type { Baby, Mix, TrackerEvent } from '../domain/types';
import type { Locale } from '../i18n';
import type { EventRow, TrackerDb } from './db';
import { loadSettings, saveSettings, type Settings } from './settings';

/** Everything this device holds, read in one transaction. */
export interface LocalData {
  babies: Baby[];
  events: TrackerEvent[];
  mixes: Mix[];
  settings: Settings;
}

/** The row without the storage-only `open` marker. Every other field stays, malformed or not. */
export function withoutOpen(row: EventRow): TrackerEvent {
  const { open: _open, ...event } = row;
  return event as TrackerEvent;
}

export async function readSnapshot(db: TrackerDb, fallbackLocale: Locale): Promise<LocalData> {
  return db.transaction('r', db.babies, db.events, db.mixes, db.settings, async () => {
    // Sorted here, not through the createdAt index: a row whose createdAt is missing or not a valid key is
    // left out of that index, and the backup must still carry it. Ordered as Ayarlar and Sesler list them.
    const byCreation = <T extends { createdAt: number }>(rows: T[]) =>
      rows.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
    const babies = byCreation(await db.babies.toArray());
    const events = await db.events.toArray();
    const mixes = byCreation(await db.mixes.toArray());
    const settings = await loadSettings(db, fallbackLocale);
    return { babies, events: events.map(withoutOpen), mixes, settings };
  });
}

export interface ImportRequest {
  backup: ParsedBackup;
  options: ImportOptions;
  /** planSignature() of the preview the user confirmed. */
  expected: string;
  fallbackLocale: Locale;
  now?: number;
}

/** applied: false means the device's data changed since the preview; nothing was written and `plan` is the new preview. */
export type ApplyResult = { applied: boolean; plan: ImportPlan };

/**
 * Writes an import in one read-write transaction over babies, events, mixes and settings, through the
 * Dexie tables (so openFlagMiddleware keeps the running index right). The device's rows are read again inside
 * the transaction and the pure plan is computed again: if it differs from the preview, nothing is
 * written. Any failure rolls everything back.
 */
export async function applyImport(db: TrackerDb, request: ImportRequest): Promise<ApplyResult> {
  const now = request.now ?? Date.now();
  return db.transaction('rw', db.babies, db.events, db.mixes, db.settings, async () => {
    const local = await readSnapshot(db, request.fallbackLocale);
    const plan = planImport(local, request.backup, request.options, now);
    if (planSignature(plan) !== request.expected) return { applied: false, plan };
    if (plan.mode === 'replace') {
      await db.events.clear();
      await db.babies.clear();
      await db.mixes.clear();
    }
    await db.babies.bulkPut(plan.babies);
    await db.events.bulkPut(plan.events);
    await db.mixes.bulkPut(plan.mixes);
    await saveSettings(db, plan.settings, request.fallbackLocale);
    return { applied: true, plan };
  });
}
