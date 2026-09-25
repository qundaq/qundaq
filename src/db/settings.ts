import { LOCALES, type Locale } from '../i18n';
import type { TrackerDb } from './db';

export interface Settings {
  locale: Locale;
  nightMode: boolean;
}

const SETTINGS_ID = 'app';

export function defaultSettings(locale: Locale): Settings {
  return { locale, nightMode: false };
}

export async function loadSettings(db: TrackerDb, fallbackLocale: Locale): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_ID);
  const defaults = defaultSettings(fallbackLocale);
  if (!row) return defaults;
  // Spread stored fields over the defaults so fields added by later versions survive a save,
  // then validate the fields this version knows about.
  const { id: _id, ...rest } = row;
  const stored: Record<string, unknown> = rest;
  const locale = LOCALES.includes(stored.locale as Locale) ? (stored.locale as Locale) : defaults.locale;
  const nightMode = typeof stored.nightMode === 'boolean' ? stored.nightMode : defaults.nightMode;
  return { ...defaults, ...stored, locale, nightMode };
}

export async function saveSettings(db: TrackerDb, patch: Partial<Settings>, fallbackLocale: Locale): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await loadSettings(db, fallbackLocale)), ...patch };
    await db.settings.put({ id: SETTINGS_ID, ...next });
    return next;
  });
}
