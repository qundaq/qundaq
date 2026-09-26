import { readLastSound, readVolumeCap, type LastSound } from '../domain/sounds';
import type { Id } from '../domain/types';
import { LOCALES, type Locale } from '../i18n';
import type { TrackerDb } from './db';

export interface Settings {
  locale: Locale;
  nightMode: boolean;
  lastBabyIds: Id[];
  /** When this device last saved a JSON backup (a completed share, or a download the user confirmed). Never exported. */
  lastBackupAt?: number;
  /** Home's backup reminder stays hidden until then ("Yarın hatırlat"). Never exported. */
  backupReminderSnoozedUntil?: number;
  /**
   * Ayarlar → Ses güvenlik sınırı, a slider value in 0.2–1 (absent: the default, 0.5). Never exported: a
   * restore must never raise another phone's safety limit.
   */
  volumeCap?: number;
  /** The Sesler tab's last selection, restored at launch without playing. Never exported. */
  lastSound?: LastSound;
}

/** Optional times in the settings row: kept when finite, dropped otherwise. */
const OPTIONAL_TIMES = ['lastBackupAt', 'backupReminderSnoozedUntil'] as const;

const SETTINGS_ID = 'app';

export function defaultSettings(locale: Locale): Settings {
  return { locale, nightMode: false, lastBabyIds: [] };
}

export async function loadSettings(db: TrackerDb, fallbackLocale: Locale): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_ID);
  const defaults = defaultSettings(fallbackLocale);
  if (!row) return defaults;

  // Spread stored fields over the defaults so fields added by later versions survive a save,
  // then validate the fields this version knows about.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the property
  const { id: _id, ...rest } = row;
  const stored: Record<string, unknown> = rest;
  const locale = LOCALES.includes(stored.locale as Locale)
    ? (stored.locale as Locale)
    : defaults.locale;
  const nightMode = typeof stored.nightMode === 'boolean' ? stored.nightMode : defaults.nightMode;
  const lastBabyIds =
    Array.isArray(stored.lastBabyIds) && stored.lastBabyIds.every((id) => typeof id === 'string')
      ? stored.lastBabyIds
      : defaults.lastBabyIds;

  const settings: Settings = { ...defaults, ...stored, locale, nightMode, lastBabyIds };
  for (const key of OPTIONAL_TIMES) {
    const value = stored[key];
    if (!(typeof value === 'number' && Number.isFinite(value))) delete settings[key];
  }

  // The sound settings decide loudness and what starts on a tap: an unreadable value is dropped, so the default applies.
  const cap = stored.volumeCap;
  if (readVolumeCap(cap) === cap) settings.volumeCap = cap;
  else delete settings.volumeCap;
  delete settings.lastSound;
  const lastSound = readLastSound(stored.lastSound);
  if (lastSound) settings.lastSound = lastSound;
  return settings;
}

export async function saveSettings(
  db: TrackerDb,
  patch: Partial<Settings>,
  fallbackLocale: Locale,
): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await loadSettings(db, fallbackLocale)), ...patch };
    await db.settings.put({ id: SETTINGS_ID, ...next });
    return next;
  });
}
